# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Count, Max, Q
from django.utils import timezone

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers.issue_checklist import IssueChecklistItemSerializer, IssueChecklistSerializer
from plane.db.models import Issue, IssueChecklist, IssueChecklistItem, ProjectMember

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


def _resolve_checklist(issue, checklist_id):
    """(checklist, None) or (None, error_response). Vazio = a lista padrão ("Subtarefas")."""
    if not checklist_id:
        return None, None
    checklist = IssueChecklist.objects.filter(issue=issue, pk=checklist_id).first()
    if not checklist:
        return None, Response({"error": "Invalid checklist"}, status=status.HTTP_400_BAD_REQUEST)
    return checklist, None


def _subtree_ids(item):
    ids, frontier = [item.id], [item.id]
    while frontier:
        frontier = list(IssueChecklistItem.objects.filter(parent_id__in=frontier).values_list("id", flat=True))
        ids.extend(frontier)
    return ids


def _validate_assignee(project_id, assignee_id):
    if not assignee_id:
        return True
    return ProjectMember.objects.filter(project_id=project_id, member_id=assignee_id, is_active=True).exists()


def _next_sort_order(issue, parent, checklist=None):
    siblings = IssueChecklistItem.objects.filter(issue=issue, parent=parent)
    if parent is None:
        siblings = siblings.filter(checklist=checklist)
    largest = siblings.aggregate(largest=Max("sort_order"))["largest"]
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
        # Sublinha fica na checklist da linha de cima; linha de primeiro nível, na pedida (ou na padrão).
        if parent:
            checklist = parent.checklist
        else:
            checklist, error = _resolve_checklist(issue, request.data.get("checklist"))
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
            checklist=checklist,
            sort_order=serializer.validated_data.get("sort_order", _next_sort_order(issue, parent, checklist)),
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
        new_checklist = item.checklist
        if "parent" in request.data:
            parent, error = _resolve_parent(item.issue, request.data.get("parent"), item=item)
            if error:
                return error
            extra["parent"] = parent
            if parent:
                new_checklist = parent.checklist
        # Mudar de checklist: a linha vai para o primeiro nível da outra lista, com as sublinhas.
        if "checklist" in request.data and not extra.get("parent"):
            new_checklist, error = _resolve_checklist(item.issue, request.data.get("checklist"))
            if error:
                return error
            extra["parent"] = None
        if "assignee" in request.data and not _validate_assignee(project_id, request.data.get("assignee")):
            return Response({"error": "Assignee must be a project member"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = IssueChecklistItemSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if (
            "is_completed" in serializer.validated_data
            and serializer.validated_data["is_completed"] != item.is_completed
        ):
            extra["completed_at"] = timezone.now() if serializer.validated_data["is_completed"] else None
        if new_checklist != item.checklist:
            IssueChecklistItem.objects.filter(pk__in=_subtree_ids(item)).update(checklist=new_checklist)
            item.checklist = new_checklist
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


class IssueChecklistEndpoint(BaseAPIView):
    """Pespo: checklists com nome de um item de trabalho. As linhas de cada uma vêm pelo endpoint das
    linhas (campo ``checklist``)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        checklists = IssueChecklist.objects.filter(workspace__slug=slug, project_id=project_id, issue_id=issue_id)
        return Response(IssueChecklistSerializer(checklists, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue = _get_issue(slug, project_id, issue_id)
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = IssueChecklistSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        largest = IssueChecklist.objects.filter(issue=issue).aggregate(largest=Max("sort_order"))["largest"]
        checklist = serializer.save(
            issue=issue,
            project_id=project_id,
            sort_order=serializer.validated_data.get(
                "sort_order", (largest + SORT_ORDER_STEP) if largest is not None else 65535
            ),
        )
        return Response(IssueChecklistSerializer(checklist).data, status=status.HTTP_201_CREATED)


class IssueChecklistDetailEndpoint(BaseAPIView):
    def _get(self, slug, project_id, issue_id, pk):
        return IssueChecklist.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=pk
        ).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, issue_id, pk):
        checklist = self._get(slug, project_id, issue_id, pk)
        if not checklist:
            return Response({"error": "Checklist not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = IssueChecklistSerializer(checklist, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        checklist = serializer.save()
        return Response(IssueChecklistSerializer(checklist).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, issue_id, pk):
        checklist = self._get(slug, project_id, issue_id, pk)
        if not checklist:
            return Response({"error": "Checklist not found"}, status=status.HTTP_404_NOT_FOUND)
        # Exclusão definitiva, com as linhas (como apagar uma linha).
        IssueChecklistItem.objects.filter(checklist=checklist).delete(soft=False)
        checklist.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectChecklistProgressEndpoint(BaseAPIView):
    """Pespo: progresso das subtarefas de cada item do projeto, para o "3/5" dos cards da lista e do
    quadro. Só itens com alguma linha aparecem: ``{issue_id: {"done": n, "total": m}}``."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        rows = (
            IssueChecklistItem.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                issue__deleted_at__isnull=True,
                issue__archived_at__isnull=True,
            )
            .values("issue_id")
            .annotate(total=Count("id"), done=Count("id", filter=Q(is_completed=True)))
        )
        return Response(
            {str(row["issue_id"]): {"done": row["done"], "total": row["total"]} for row in rows},
            status=status.HTTP_200_OK,
        )
