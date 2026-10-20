# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Max
from django.utils import timezone

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers.issue_checklist import IssueChecklistItemSerializer
from plane.db.models import Issue, IssueChecklistItem, ProjectMember

SORT_ORDER_STEP = 10000


def _get_issue(slug, project_id, issue_id):
    return Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()


def _resolve_parent(issue, parent_id, item=None):
    """(parent, None) or (None, error_response). ``parent_id`` vazio = raiz. A linha nova pai
    precisa ser do mesmo item e não pode ser a própria linha nem uma das suas sublistas."""
    if not parent_id:
        return None, None
    parent = IssueChecklistItem.objects.filter(issue=issue, pk=parent_id).first()
    if not parent:
        return None, Response({"error": "Invalid parent"}, status=status.HTTP_400_BAD_REQUEST)
    if item:
        ancestor = parent
        while ancestor:
            if ancestor.id == item.id:
                return None, Response({"error": "Invalid parent"}, status=status.HTTP_400_BAD_REQUEST)
            ancestor = ancestor.parent
    return parent, None


def _validate_assignee(project_id, assignee_id):
    if not assignee_id:
        return True
    return ProjectMember.objects.filter(project_id=project_id, member_id=assignee_id, is_active=True).exists()


def _next_sort_order(issue, parent):
    largest = IssueChecklistItem.objects.filter(issue=issue, parent=parent).aggregate(largest=Max("sort_order"))[
        "largest"
    ]
    return (largest + SORT_ORDER_STEP) if largest is not None else 65535


class IssueChecklistItemEndpoint(BaseAPIView):
    """Pespo: subtarefas leves (checklist em árvore) de um item de trabalho. A lista vem
    plana — o frontend monta a árvore pelo ``parent``."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        items = IssueChecklistItem.objects.filter(workspace__slug=slug, project_id=project_id, issue_id=issue_id)
        return Response(IssueChecklistItemSerializer(items, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue = _get_issue(slug, project_id, issue_id)
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        parent, error = _resolve_parent(issue, request.data.get("parent"))
        if error:
            return error
        if not _validate_assignee(project_id, request.data.get("assignee")):
            return Response({"error": "Assignee must be a project member"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = IssueChecklistItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        is_completed = serializer.validated_data.get("is_completed", False)
        item = serializer.save(
            issue=issue,
            project_id=project_id,
            parent=parent,
            sort_order=serializer.validated_data.get("sort_order", _next_sort_order(issue, parent)),
            completed_at=timezone.now() if is_completed else None,
        )
        return Response(IssueChecklistItemSerializer(item).data, status=status.HTTP_201_CREATED)


class IssueChecklistItemDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, issue_id, pk):
        item = (
            IssueChecklistItem.objects.filter(workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=pk)
            .select_related("issue")
            .first()
        )
        if not item:
            return Response({"error": "Checklist item not found"}, status=status.HTTP_404_NOT_FOUND)

        extra = {}
        if "parent" in request.data:
            parent, error = _resolve_parent(item.issue, request.data.get("parent"), item=item)
            if error:
                return error
            extra["parent"] = parent
        if "assignee" in request.data and not _validate_assignee(project_id, request.data.get("assignee")):
            return Response({"error": "Assignee must be a project member"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = IssueChecklistItemSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if "is_completed" in serializer.validated_data and serializer.validated_data["is_completed"] != item.is_completed:
            extra["completed_at"] = timezone.now() if serializer.validated_data["is_completed"] else None
        item = serializer.save(**extra)
        return Response(IssueChecklistItemSerializer(item).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, issue_id, pk):
        item = IssueChecklistItem.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=pk
        ).first()
        if not item:
            return Response({"error": "Checklist item not found"}, status=status.HTTP_404_NOT_FOUND)
        # Exclusão definitiva: o CASCADE do parent leva junto as sublistas.
        item.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
