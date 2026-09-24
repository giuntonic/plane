# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import io
import json
import uuid

# Django imports
from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import IssueAttachmentSerializer
from plane.app.serializers.google_drive import IssueGoogleDriveFileSerializer
from plane.app.views.user.google_drive import drive_error_response, get_drive_access_token, not_connected_response
from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.db.models import FileAsset, Issue, IssueGoogleDriveFile
from plane.settings.storage import S3Storage
from plane.utils import google_drive as gdrive
from plane.utils.host import base_host
from plane.utils.path_validator import sanitize_filename


def _get_issue(slug, project_id, issue_id):
    return Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()


def _fetch_drive_file(request, file_id):
    """(file, None) with the Drive metadata of file_id as seen by the
    requesting user, or (None, error_response). Metadata always comes from
    Drive itself — never from the request body — so a stored web_view_link
    is guaranteed to be a real Drive URL."""
    if not gdrive.is_valid_drive_id(file_id):
        return None, Response({"error": "Invalid file id"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        connection, access_token = get_drive_access_token(request.user)
    except Exception as e:
        return None, drive_error_response(e)
    if not connection:
        return None, not_connected_response()
    try:
        return (gdrive.get_file(access_token, file_id), access_token), None
    except Exception as e:
        return None, drive_error_response(e)


class IssueGoogleDriveFileEndpoint(BaseAPIView):
    """Google Drive files linked to a work item (metadata only)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        files = IssueGoogleDriveFile.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id
        ).select_related("created_by")
        return Response(IssueGoogleDriveFileSerializer(files, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue = _get_issue(slug, project_id, issue_id)
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        result, error = _fetch_drive_file(request, request.data.get("file_id"))
        if error:
            return error
        file, _ = result
        if file.get("mimeType") == gdrive.FOLDER_MIME_TYPE:
            return Response({"error": "Folders can't be attached"}, status=status.HTTP_400_BAD_REQUEST)

        existing = IssueGoogleDriveFile.objects.filter(issue=issue, drive_file_id=file["id"]).first()
        if existing:
            return Response(IssueGoogleDriveFileSerializer(existing).data, status=status.HTTP_200_OK)

        drive_file = IssueGoogleDriveFile.objects.create(
            issue=issue,
            project_id=project_id,
            drive_file_id=file["id"],
            name=(file.get("name") or "")[:1024],
            mime_type=file.get("mimeType", ""),
            web_view_link=file.get("webViewLink", ""),
            icon_link=file.get("iconLink", ""),
        )
        data = IssueGoogleDriveFileSerializer(drive_file).data

        # Logged as a link on the activity feed — it's what it is from the
        # work item's point of view, and needs no new activity type.
        issue_activity.delay(
            type="link.activity.created",
            requested_data=json.dumps({"id": str(drive_file.id), "url": drive_file.web_view_link}),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        return Response(data, status=status.HTTP_201_CREATED)


class IssueGoogleDriveFileDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], creator=True, model=IssueGoogleDriveFile)
    def delete(self, request, slug, project_id, issue_id, pk):
        drive_file = IssueGoogleDriveFile.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=pk
        ).first()
        if not drive_file:
            return Response(status=status.HTTP_204_NO_CONTENT)

        issue_activity.delay(
            type="link.activity.deleted",
            requested_data=json.dumps({"link_id": str(pk)}),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=json.dumps({"url": drive_file.web_view_link}),
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        drive_file.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueGoogleDriveImportEndpoint(BaseAPIView):
    """Copies a Drive file into Plane as a regular work item attachment
    (Google Docs/Sheets/Slides are exported to PDF/XLSX first). Unlike a
    linked file, the copy is a frozen snapshot but is readable by every
    project member, with or without access to the file in Drive."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id, issue_id):
        issue = _get_issue(slug, project_id, issue_id)
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        result, error = _fetch_drive_file(request, request.data.get("file_id"))
        if error:
            return error
        file, access_token = result

        try:
            content, filename, content_type = gdrive.download_file(
                access_token, file, max_bytes=settings.FILE_SIZE_LIMIT
            )
        except gdrive.GoogleDriveFileTooLarge:
            return Response(
                {"error": "File is larger than the attachment size limit", "code": "GOOGLE_DRIVE_FILE_TOO_LARGE"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except gdrive.GoogleDriveNotExportable:
            return Response(
                {"error": "This kind of file can't be copied", "code": "GOOGLE_DRIVE_NOT_EXPORTABLE"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            return drive_error_response(e)

        if content_type not in settings.ATTACHMENT_MIME_TYPES:
            return Response(
                {"error": "File type is not allowed as an attachment", "code": "GOOGLE_DRIVE_TYPE_NOT_ALLOWED"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        name = sanitize_filename(filename) or "arquivo"
        asset_key = f"{issue.workspace_id}/{uuid.uuid4().hex}-{name}"
        storage = S3Storage(request=request)
        if not storage.upload_file(io.BytesIO(content), asset_key, content_type):
            return Response({"error": "Failed to store the file"}, status=status.HTTP_502_BAD_GATEWAY)

        asset = FileAsset.objects.create(
            attributes={"name": name, "type": content_type, "size": len(content)},
            asset=asset_key,
            size=len(content),
            workspace_id=issue.workspace_id,
            created_by=request.user,
            issue_id=issue_id,
            project_id=project_id,
            entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
            is_uploaded=True,
        )
        get_asset_object_metadata.delay(str(asset.id))

        data = IssueAttachmentSerializer(asset).data
        issue_activity.delay(
            type="attachment.activity.created",
            requested_data=None,
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=json.dumps(data, cls=DjangoJSONEncoder),
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        return Response(data, status=status.HTTP_201_CREATED)
