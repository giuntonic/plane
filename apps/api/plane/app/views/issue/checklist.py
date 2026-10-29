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
from plane.app.serializers.issue_checklist import IssueChecklistItemSerializer, IssueChecklistSerializer
from plane.db.models import Issue, IssueChecklist, IssueChecklistItem, ProjectMember, State, StateGroup

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


def _validate_state(project_id, state_id):
    """Vazio = sem estado. O estado tem que ser do fluxo do mesmo projeto (fora a triagem)."""
    if not state_id:
        return True
    return State.objects.filter(project_id=project_id, pk=state_id).exists()


def _state_after_toggle(project_id, state, is_completed):
    """Estado de uma linha que tem estado e acabou de ser marcada ou desmarcada no quadradinho.

    Marcada: o primeiro estado de "concluído" do projeto, se ela ainda não está num. Desmarcada estando
    num estado de concluído: o estado padrão do projeto (ou nenhum, se o padrão também for de concluído).
    Nos outros casos o estado fica como está."""
    is_done_state = state.group == StateGroup.COMPLETED.value
    if is_completed and not is_done_state:
        completed = (
            State.objects.filter(project_id=project_id, group=StateGroup.COMPLETED.value).order_by("sequence").first()
        )
        return completed or state
    if not is_completed and is_done_state:
        return (
            State.objects.filter(project_id=project_id, default=True).exclude(group=StateGroup.COMPLETED.value).first()
        )
    return state


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
        if not _validate_state(project_id, request.data.get("state")):
            return Response({"error": "Invalid state"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = IssueChecklistItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        state = serializer.validated_data.get("state")
        is_completed = serializer.validated_data.get("is_completed", False)
        # Com estado e sem o quadradinho no pedido, o estado decide se a linha nasce concluída.
        if state and "is_completed" not in serializer.validated_data:
            is_completed = state.group == StateGroup.COMPLETED.value
        item = serializer.save(
            issue=issue,
            project_id=project_id,
            parent=parent,
            checklist=checklist,
            sort_order=serializer.validated_data.get("sort_order", _next_sort_order(issue, parent, checklist)),
            is_completed=is_completed,
            completed_at=timezone.now() if is_completed else None,
        )
        return Response(IssueChecklistItemSerializer(item).data, status=status.HTTP_201_CREATED)


class IssueChecklistItemDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, issue_id, pk):
        item = (
            IssueChecklistItem.objects.filter(workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=pk)
            .select_related("issue", "state")
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
        if "state" in request.data and not _validate_state(project_id, request.data.get("state")):
            return Response({"error": "Invalid state"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = IssueChecklistItemSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        is_completed = data.get("is_completed", item.is_completed)
        # Estado e quadradinho andam juntos: escolher um estado de "concluído" marca a linha e qualquer
        # outro a desmarca; marcar ou desmarcar uma linha que tem estado troca o estado
        # (_state_after_toggle). Linha sem estado é só o quadradinho, como antes.
        if "state" in data:
            if data["state"] and "is_completed" not in data:
                is_completed = data["state"].group == StateGroup.COMPLETED.value
                extra["is_completed"] = is_completed
        elif "is_completed" in data and item.state_id and is_completed != item.is_completed:
            extra["state"] = _state_after_toggle(project_id, item.state, is_completed)
        if is_completed != item.is_completed:
            extra["completed_at"] = timezone.now() if is_completed else None
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
