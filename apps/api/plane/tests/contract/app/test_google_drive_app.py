# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the Google Drive integration: the personal connection
endpoints (users/me/google-drive/…) and the work item endpoints
(…/issues/<id>/google-drive-files/…). Google itself is never called — the
Drive client functions are patched."""

from unittest import mock

import pytest
import requests
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    FileAsset,
    GoogleDriveConnection,
    Issue,
    IssueGoogleDriveFile,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)

DOC = {
    "id": "doc_123",
    "name": "Briefing",
    "mimeType": "application/vnd.google-apps.document",
    "webViewLink": "https://docs.google.com/document/d/doc_123/edit",
    "iconLink": "https://drive-thirdparty.googleusercontent.com/16/type/application/vnd.google-apps.document",
}


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Drive Project", identifier="DRV", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def issue(db, project):
    state = State.objects.create(name="Todo", group="unstarted", project=project, workspace=project.workspace)
    return Issue.objects.create(name="Drive Issue", project=project, workspace=project.workspace, state=state)


@pytest.fixture
def drive_connection(db, create_user):
    connection = GoogleDriveConnection(user=create_user, google_email="me@gmail.com")
    connection.access_token = "access"
    connection.refresh_token = "refresh"
    connection.save()
    return connection


@pytest.fixture
def guest_client(db, workspace, project):
    guest = User.objects.create(email="guest-drive@plane.so", username="guest_drive")
    WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
    ProjectMember.objects.create(project=project, member=guest, role=5, is_active=True)
    client = APIClient()
    client.force_authenticate(user=guest)
    return client


@pytest.fixture
def mock_drive():
    with (
        mock.patch("plane.utils.google_drive.get_valid_access_token", return_value="access") as token,
        mock.patch("plane.utils.google_drive.get_file", return_value=dict(DOC)) as get_file,
        mock.patch("plane.app.views.issue.google_drive.issue_activity") as activity,
    ):
        yield {"token": token, "get_file": get_file, "activity": activity}


def _files_url(workspace, project, issue, suffix=""):
    base = reverse(
        "project-issue-google-drive-files",
        kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id},
    )
    return f"{base}{suffix}"


@pytest.mark.contract
class TestGoogleDrivePersonalConnection:
    @pytest.mark.django_db
    def test_status_when_not_connected(self, session_client):
        response = session_client.get(reverse("google-drive-status"))
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"connected": False}

    @pytest.mark.django_db
    def test_status_never_leaks_tokens(self, session_client, drive_connection):
        response = session_client.get(reverse("google-drive-status"))
        assert response.data["connected"] is True
        assert response.data["google_email"] == "me@gmail.com"
        assert "access" not in str(response.data.values())

    @pytest.mark.django_db
    def test_tokens_are_encrypted_at_rest(self, drive_connection):
        row = GoogleDriveConnection.objects.get(pk=drive_connection.pk)
        assert row._access_token != "access"
        assert row.access_token == "access"

    @pytest.mark.django_db
    def test_browse_requires_connection(self, session_client):
        response = session_client.get(reverse("google-drive-files"))
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "GOOGLE_DRIVE_NOT_CONNECTED"

    @pytest.mark.django_db
    def test_browse_returns_serialized_files(self, session_client, drive_connection):
        with (
            mock.patch("plane.utils.google_drive.get_valid_access_token", return_value="access"),
            mock.patch(
                "plane.utils.google_drive.list_files", return_value={"files": [DOC], "next_page_token": "n"}
            ) as list_files,
        ):
            response = session_client.get(reverse("google-drive-files"), {"view": "shared", "search": " ata "})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["next_page_token"] == "n"
        assert response.data["files"][0]["web_view_link"] == DOC["webViewLink"]
        assert list_files.call_args.kwargs["search"] == "ata"
        assert list_files.call_args.kwargs["view"] == "shared"

    @pytest.mark.django_db
    def test_browse_rejects_invalid_folder_id(self, session_client, drive_connection):
        with mock.patch("plane.utils.google_drive.get_valid_access_token", return_value="access"):
            response = session_client.get(reverse("google-drive-files"), {"folder_id": "x' or 1=1"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_revoked_grant_is_reported_as_forbidden(self, session_client, drive_connection):
        error_response = requests.Response()
        error_response.status_code = 401
        with (
            mock.patch("plane.utils.google_drive.get_valid_access_token", return_value="access"),
            mock.patch("plane.utils.google_drive.list_files", side_effect=requests.HTTPError(response=error_response)),
        ):
            response = session_client.get(reverse("google-drive-files"))
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data["code"] == "GOOGLE_DRIVE_FORBIDDEN"

    @pytest.mark.django_db
    def test_create_document(self, session_client, drive_connection):
        with (
            mock.patch("plane.utils.google_drive.get_valid_access_token", return_value="access"),
            mock.patch("plane.utils.google_drive.create_file", return_value=dict(DOC)) as create_file,
        ):
            response = session_client.post(
                reverse("google-drive-files"), {"kind": "document", "name": "Briefing"}, format="json"
            )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["id"] == DOC["id"]
        create_file.assert_called_once_with("access", "Briefing", "document", None)

    @pytest.mark.django_db
    def test_create_rejects_unknown_kind(self, session_client, drive_connection):
        response = session_client.post(reverse("google-drive-files"), {"kind": "form", "name": "x"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_disconnect_revokes_and_hard_deletes(self, session_client, drive_connection):
        with mock.patch("plane.utils.google_drive.revoke_token") as revoke:
            response = session_client.delete(reverse("google-drive-disconnect"))
        assert response.status_code == status.HTTP_204_NO_CONTENT
        revoke.assert_called_once()
        # Hard delete: no soft-deleted row left holding the (encrypted) tokens
        # or blocking a reconnect through the OneToOne on user.
        assert not GoogleDriveConnection.all_objects.filter(pk=drive_connection.pk).exists()

    @pytest.mark.django_db
    def test_callback_rejects_state_mismatch(self, create_user):
        client = APIClient()
        client.force_login(create_user)
        session = client.session
        session["google_drive_state"] = "expected"
        session["google_drive_next"] = "/ws/projects/1/issues/2/"
        session.save()

        response = client.get(reverse("google-drive-callback"), {"code": "c", "state": "forged"})

        assert response.status_code == status.HTTP_302_FOUND
        assert response["Location"].endswith("/ws/projects/1/issues/2/?google_drive=error")
        assert not GoogleDriveConnection.objects.filter(user=create_user).exists()

    @pytest.mark.django_db
    def test_connect_ignores_absolute_next_path(self, create_user):
        client = APIClient()
        client.force_login(create_user)
        with (
            mock.patch(
                "plane.app.views.user.google_drive.GoogleDriveOAuthProvider.get_auth_url", return_value="https://g/auth"
            ),
            mock.patch(
                "plane.authentication.provider.oauth.google_calendar.get_configuration_value",
                return_value=("id", "secret"),
            ),
        ):
            client.get(reverse("google-drive-connect"), {"next_path": "//evil.example.com/x"})
        assert client.session.get("google_drive_next") is None


@pytest.mark.contract
class TestIssueGoogleDriveFiles:
    @pytest.mark.django_db
    def test_link_file_uses_drive_metadata_not_request_body(
        self, session_client, workspace, project, issue, drive_connection, mock_drive
    ):
        response = session_client.post(
            _files_url(workspace, project, issue),
            {"file_id": DOC["id"], "web_view_link": "javascript:alert(1)", "name": "spoofed"},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Briefing"
        assert response.data["web_view_link"] == DOC["webViewLink"]
        assert response.data["drive_file_id"] == DOC["id"]
        mock_drive["activity"].delay.assert_called_once()
        assert mock_drive["activity"].delay.call_args.kwargs["type"] == "link.activity.created"

    @pytest.mark.django_db
    def test_linking_twice_returns_the_existing_row(
        self, session_client, workspace, project, issue, drive_connection, mock_drive
    ):
        url = _files_url(workspace, project, issue)
        first = session_client.post(url, {"file_id": DOC["id"]}, format="json")
        second = session_client.post(url, {"file_id": DOC["id"]}, format="json")
        assert second.status_code == status.HTTP_200_OK
        assert second.data["id"] == first.data["id"]
        assert IssueGoogleDriveFile.objects.filter(issue=issue).count() == 1

    @pytest.mark.django_db
    def test_link_requires_connection(self, session_client, workspace, project, issue):
        response = session_client.post(_files_url(workspace, project, issue), {"file_id": DOC["id"]}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "GOOGLE_DRIVE_NOT_CONNECTED"

    @pytest.mark.django_db
    def test_folders_cannot_be_linked(self, session_client, workspace, project, issue, drive_connection, mock_drive):
        mock_drive["get_file"].return_value = {**DOC, "mimeType": "application/vnd.google-apps.folder"}
        response = session_client.post(_files_url(workspace, project, issue), {"file_id": DOC["id"]}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_guest_can_list_but_not_link(self, guest_client, workspace, project, issue, mock_drive):
        IssueGoogleDriveFile.objects.create(
            issue=issue, project=project, drive_file_id="f", name="Visível", web_view_link="https://x"
        )
        url = _files_url(workspace, project, issue)
        listed = guest_client.get(url)
        assert listed.status_code == status.HTTP_200_OK
        assert [f["name"] for f in listed.data] == ["Visível"]

        response = guest_client.post(url, {"file_id": DOC["id"]}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_non_member_cannot_list(self, workspace, project, issue):
        outsider = User.objects.create(email="outsider-drive@plane.so", username="outsider_drive")
        WorkspaceMember.objects.create(workspace=workspace, member=outsider, role=15)
        client = APIClient()
        client.force_authenticate(user=outsider)
        response = client.get(_files_url(workspace, project, issue))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_unlink_then_relink(self, session_client, workspace, project, issue, drive_connection, mock_drive):
        url = _files_url(workspace, project, issue)
        created = session_client.post(url, {"file_id": DOC["id"]}, format="json")
        detail_url = reverse(
            "project-issue-google-drive-file-detail",
            kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id, "pk": created.data["id"]},
        )
        with mock.patch("plane.db.mixins.soft_delete_related_objects"):
            assert session_client.delete(detail_url).status_code == status.HTTP_204_NO_CONTENT
        assert session_client.get(url).data == []
        # The unique constraint only covers live rows — re-linking works.
        again = session_client.post(url, {"file_id": DOC["id"]}, format="json")
        assert again.status_code == status.HTTP_201_CREATED

    @pytest.mark.django_db
    def test_import_copies_file_as_attachment(
        self, session_client, workspace, project, issue, drive_connection, mock_drive
    ):
        with (
            mock.patch(
                "plane.utils.google_drive.download_file",
                return_value=(b"%PDF-1.4", "Briefing.pdf", "application/pdf"),
            ),
            mock.patch("plane.app.views.issue.google_drive.S3Storage") as storage,
            mock.patch("plane.app.views.issue.google_drive.get_asset_object_metadata"),
        ):
            storage.return_value.upload_file.return_value = True
            response = session_client.post(
                _files_url(workspace, project, issue, "import/"), {"file_id": DOC["id"]}, format="json"
            )

        assert response.status_code == status.HTTP_201_CREATED
        asset = FileAsset.objects.get(pk=response.data["id"])
        assert asset.is_uploaded is True
        assert asset.issue_id == issue.id
        assert asset.entity_type == FileAsset.EntityTypeContext.ISSUE_ATTACHMENT
        assert asset.attributes["name"] == "Briefing.pdf"
        assert asset.size == len(b"%PDF-1.4")
        assert mock_drive["activity"].delay.call_args.kwargs["type"] == "attachment.activity.created"

    @pytest.mark.django_db
    def test_import_rejects_files_over_the_size_limit(
        self, session_client, workspace, project, issue, drive_connection, mock_drive
    ):
        from plane.utils import google_drive as gdrive

        with mock.patch("plane.utils.google_drive.download_file", side_effect=gdrive.GoogleDriveFileTooLarge()):
            response = session_client.post(
                _files_url(workspace, project, issue, "import/"), {"file_id": DOC["id"]}, format="json"
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "GOOGLE_DRIVE_FILE_TOO_LARGE"
        assert not FileAsset.objects.filter(issue_id=issue.id).exists()

    @pytest.mark.django_db
    def test_import_rejects_disallowed_types(
        self, session_client, workspace, project, issue, drive_connection, mock_drive
    ):
        with mock.patch(
            "plane.utils.google_drive.download_file",
            return_value=(b"MZ", "setup.exe", "application/x-msdownload"),
        ):
            response = session_client.post(
                _files_url(workspace, project, issue, "import/"), {"file_id": DOC["id"]}, format="json"
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "GOOGLE_DRIVE_TYPE_NOT_ALLOWED"
