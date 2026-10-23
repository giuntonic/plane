# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.db.models import Issue, ProjectMember, WorkspaceUserLink, Workspace
from plane.app.serializers import WorkspaceUserLinkSerializer
from plane.app.serializers.workspace import work_item_link_detail
from ..base import BaseViewSet
from plane.app.permissions import allow_permission, ROLE


def _resolve_link_issue(user, workspace_id, issue_id):
    """Pespo: (issue, None) or (None, error_response). Só dá pra fixar na home um item de
    trabalho do mesmo workspace que a pessoa consegue ver."""
    issue = (
        Issue.issue_objects.filter(workspace_id=workspace_id, pk=issue_id)
        .select_related("project", "state")
        .first()
    )
    role = (
        ProjectMember.objects.filter(project_id=issue.project_id, member=user, is_active=True)
        .values_list("role", flat=True)
        .first()
        if issue
        else None
    )
    if not issue or work_item_link_detail(issue, user.id, role) is None:
        return None, Response({"error": "Work item not found"}, status=status.HTTP_400_BAD_REQUEST)
    return issue, None


def _work_item_url(slug, issue):
    return f"{settings.WEB_URL}/{slug}/browse/{issue.project.identifier}-{issue.sequence_id}/"


class QuickLinkViewSet(BaseViewSet):
    model = WorkspaceUserLink
    use_read_replica = True

    def get_serializer_class(self):
        return WorkspaceUserLinkSerializer

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        issue = None
        if request.data.get("issue"):
            issue, error = _resolve_link_issue(request.user, workspace.id, request.data.get("issue"))
            if error:
                return error
        data = {key: value for key, value in request.data.items() if not (issue and key == "url")}
        serializer = WorkspaceUserLinkSerializer(data=data, context={"issue": issue})

        if serializer.is_valid():
            extra = {"issue": issue, "url": _work_item_url(slug, issue)} if issue else {}
            serializer.save(workspace_id=workspace.id, owner_id=request.user.id, **extra)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        quick_link = WorkspaceUserLink.objects.filter(pk=pk, workspace__slug=slug, owner=request.user).first()

        if quick_link:
            data = request.data
            extra = {}
            if "issue" in request.data:
                # Trocar o destino: um item de trabalho (a URL passa a ser a do item) ou,
                # com ``issue: null``, de volta pra um site externo (precisa da URL).
                if request.data.get("issue"):
                    issue, error = _resolve_link_issue(request.user, quick_link.workspace_id, request.data["issue"])
                    if error:
                        return error
                    extra = {"issue": issue, "url": _work_item_url(slug, issue)}
                    data = {key: value for key, value in request.data.items() if key != "url"}
                else:
                    if not request.data.get("url"):
                        return Response({"url": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)
                    extra = {"issue": None}
            serializer = WorkspaceUserLinkSerializer(quick_link, data=data, partial=True)
            if serializer.is_valid():
                serializer.save(**extra)
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response({"detail": "Quick link not found."}, status=status.HTTP_404_NOT_FOUND)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        try:
            quick_link = WorkspaceUserLink.objects.get(pk=pk, workspace__slug=slug, owner=request.user)
            serializer = WorkspaceUserLinkSerializer(quick_link)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except WorkspaceUserLink.DoesNotExist:
            return Response({"error": "Quick link not found."}, status=status.HTTP_404_NOT_FOUND)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        quick_link = WorkspaceUserLink.objects.get(pk=pk, workspace__slug=slug, owner=request.user)
        quick_link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        quick_links = WorkspaceUserLink.objects.filter(workspace__slug=slug, owner=request.user).select_related(
            "issue", "issue__project", "issue__state"
        )
        # Papel da pessoa em cada projeto, numa consulta só (decide se o item do link aparece).
        project_roles = dict(
            ProjectMember.objects.filter(
                workspace__slug=slug, member=request.user, is_active=True
            ).values_list("project_id", "role")
        )

        serializer = WorkspaceUserLinkSerializer(quick_links, many=True, context={"project_roles": project_roles})
        return Response(serializer.data, status=status.HTTP_200_OK)
