# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: estrutura do item de trabalho (cópia com subtarefas e sub-itens, subtarefa que vira item e item
que vira subtarefa). As regras da recriação estão em ``plane.utils.work_item_tree``."""

# Python imports
import json

# Django imports
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    Issue,
    IssueAssignee,
    IssueChecklist,
    IssueChecklistItem,
    Project,
    ProjectMember,
    State,
    UserRecentVisit,
)
from plane.utils.host import base_host
from plane.utils.work_item_tree import (
    WorkItemTreeTooLarge,
    apply_extras,
    apply_structure,
    date_shifter,
    issue_anchor,
    project_context,
    snapshot_work_item,
)


def _too_large():
    return Response(
        {"error": "Work item tree is too large to copy", "code": "WORK_ITEM_TREE_TOO_LARGE"},
        status=status.HTTP_400_BAD_REQUEST,
    )


class IssueCopyStructureEndpoint(BaseAPIView):
    """Recria no item ``issue_id`` (acabou de ser criado pelo modal de cópia) as subtarefas, os links e
    os sub-itens do item ``source_issue_id``."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        source = Issue.issue_objects.filter(workspace__slug=slug, pk=request.data.get("source_issue_id")).first()
        # O original tem que ser de um projeto em que a pessoa está.
        if (
            not source
            or source.id == issue.id
            or not ProjectMember.objects.filter(
                project_id=source.project_id, member=request.user, is_active=True
            ).exists()
        ):
            return Response({"error": "Source work item not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            node = snapshot_work_item(source)
        except WorkItemTreeTooLarge:
            return _too_large()

        ctx = project_context(issue.project, request.user)
        shift = date_shifter(issue_anchor(source), issue_anchor(issue), keep_unanchored_dates=True)
        with transaction.atomic():
            apply_structure(issue, node, ctx, shift, origin=base_host(request=request, is_app=True))

        return Response(
            {
                "sub_work_items": Issue.issue_objects.filter(parent=issue).count(),
                "checklist_items": IssueChecklistItem.objects.filter(issue=issue).count(),
            },
            status=status.HTTP_201_CREATED,
        )


class IssueChecklistItemConvertEndpoint(BaseAPIView):
    """Uma subtarefa (linha do checklist) vira item de trabalho: o nome, o responsável e o prazo vão
    para o item, e as sublinhas viram o checklist dele (as mesmas linhas, com o que já estava
    marcado). Por padrão o item novo é sub-item do atual; ``as_sub_item: false`` cria um item solto.
    A linha sai do checklist."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id, pk):
        issue = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()
        line = IssueChecklistItem.objects.filter(issue=issue, pk=pk).select_related("state").first() if issue else None
        if not line:
            return Response({"error": "Checklist item not found"}, status=status.HTTP_404_NOT_FOUND)

        project = Project.objects.get(pk=project_id)
        as_sub_item = request.data.get("as_sub_item", True) is not False
        # O estado da linha vai para o item; sem estado, uma linha concluída vira item concluído.
        state = line.state if line.state_id else None
        if not state and line.is_completed:
            state = State.objects.filter(project=project, group="completed").order_by("sequence").first()

        ctx = project_context(project, request.user)
        node = {
            "assignee_ids": [str(line.assignee_id)] if line.assignee_id else [],
            "labels": [],
        }
        with transaction.atomic():
            new_issue = Issue(
                project=project,
                parent=issue if as_sub_item else None,
                name=(line.name or "").strip()[:255] or "(sem título)",
                target_date=line.due_date,
                state=state,
            )
            new_issue.save()
            apply_extras(
                new_issue, node, ctx, date_shifter(None, None, True), origin=base_host(request=request, is_app=True)
            )

            # As sublinhas mudam de item mantendo ids, marcações e a ordem; as de primeiro nível sobem
            # para a raiz do checklist novo. Os netos continuam pendurados nos mesmos pais.
            children = IssueChecklistItem.objects.filter(parent=line)
            descendants = []
            frontier = list(children.values_list("id", flat=True))
            while frontier:
                descendants.extend(frontier)
                frontier = list(IssueChecklistItem.objects.filter(parent_id__in=frontier).values_list("id", flat=True))
            # Vão para a lista padrão ("Subtarefas") do item novo.
            IssueChecklistItem.objects.filter(pk__in=descendants).update(issue=new_issue, checklist=None)
            children.update(parent=None)
            line.delete(soft=False)

        return Response(
            {
                "id": str(new_issue.id),
                "project_id": str(project.id),
                "sequence_id": new_issue.sequence_id,
                "name": new_issue.name,
                "parent_id": str(issue.id) if as_sub_item else None,
            },
            status=status.HTTP_201_CREATED,
        )


class IssueConvertToChecklistEndpoint(BaseAPIView):
    """O inverso: um item de trabalho vira subtarefa (linha do checklist) de outro item, o
    ``target_issue_id`` (o pai, no caso comum). O nome, o primeiro responsável, o prazo e o "concluído"
    vão para a linha, e o checklist do item vira as sublinhas dela. O item sai como numa exclusão normal
    (vai para a lixeira do banco), com descrição, comentários e anexos; por isso pede a mesma permissão
    de excluir (admin do projeto ou quem criou o item). Item com sub-itens não converte: os sub-itens
    ficariam sem lugar."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue = (
            Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id)
            .select_related("state")
            .first()
        )
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        is_admin = ProjectMember.objects.filter(
            project_id=project_id, member=request.user, role=ROLE.ADMIN.value, is_active=True
        ).exists()
        if not is_admin and issue.created_by_id != request.user.id:
            return Response(
                {"error": "Only project admins or the creator can convert this work item", "code": "FORBIDDEN"},
                status=status.HTTP_403_FORBIDDEN,
            )

        target = Issue.issue_objects.filter(workspace__slug=slug, pk=request.data.get("target_issue_id")).first()
        # O destino tem que estar num projeto em que a pessoa trabalha (membro ou admin, não convidado).
        if (
            not target
            or target.id == issue.id
            or not ProjectMember.objects.filter(
                project_id=target.project_id,
                member=request.user,
                role__gte=ROLE.MEMBER.value,
                is_active=True,
            ).exists()
        ):
            return Response({"error": "Target work item not found"}, status=status.HTTP_404_NOT_FOUND)
        if Issue.issue_objects.filter(parent=issue).exists():
            return Response(
                {"error": "Work item has sub-work items", "code": "HAS_SUB_WORK_ITEMS"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Responsável só se ainda trabalha no projeto do destino (a linha mostra o avatar de membro).
        assignee_id = (
            IssueAssignee.objects.filter(
                issue=issue,
                assignee__member_project__project_id=target.project_id,
                assignee__member_project__is_active=True,
            )
            .order_by("created_at")
            .values_list("assignee_id", flat=True)
            .first()
        )
        is_completed = bool(issue.state and issue.state.group == "completed")
        # O estado só vale no mesmo projeto (o fluxo é de cada projeto); a triagem não é estado de linha.
        same_project = target.project_id == issue.project_id
        line_state_id = issue.state_id if same_project and issue.state and issue.state.group != "triage" else None
        last_sort = IssueChecklistItem.objects.filter(
            issue=target, parent__isnull=True, checklist__isnull=True
        ).aggregate(value=Max("sort_order"))["value"]
        now = timezone.now()
        with transaction.atomic():
            line = IssueChecklistItem.objects.create(
                issue=target,
                project_id=target.project_id,
                workspace_id=target.workspace_id,
                name=issue.name,
                assignee_id=assignee_id,
                due_date=issue.target_date,
                state_id=line_state_id,
                is_completed=is_completed,
                completed_at=(issue.completed_at or now) if is_completed else None,
                sort_order=(last_sort or 0) + 65535,
            )
            # O checklist do item muda de dono mantendo ids, marcações e a ordem: as linhas de primeiro
            # nível ficam penduradas na linha nova.
            roots = list(
                IssueChecklistItem.objects.filter(issue=issue, parent__isnull=True).values_list("id", flat=True)
            )
            # As checklists com nome do item viram sublinhas também (a linha nova fica na lista padrão).
            moved = IssueChecklistItem.objects.filter(issue=issue)
            if not same_project:
                moved.update(state=None)
            moved.update(issue=target, project_id=target.project_id, workspace_id=target.workspace_id, checklist=None)
            IssueChecklistItem.objects.filter(pk__in=roots).update(parent=line)
            IssueChecklist.objects.filter(issue=issue).delete(soft=False)
            issue.delete()
            UserRecentVisit.objects.filter(
                project_id=project_id, workspace__slug=slug, entity_identifier=issue.id, entity_name="issue"
            ).delete(soft=False)
            issue_id_str, project_id_str, actor_id = str(issue.id), str(project_id), str(request.user.id)
            origin = base_host(request=request, is_app=True)
            transaction.on_commit(
                lambda: issue_activity.delay(
                    type="issue.activity.deleted",
                    requested_data=json.dumps({"issue_id": issue_id_str}),
                    actor_id=actor_id,
                    issue_id=issue_id_str,
                    project_id=project_id_str,
                    current_instance={},
                    epoch=int(now.timestamp()),
                    notification=True,
                    origin=origin,
                    subscriber=False,
                )
            )

        return Response(
            {
                "checklist_item_id": str(line.id),
                "target_issue_id": str(target.id),
                "project_id": str(target.project_id),
            },
            status=status.HTTP_201_CREATED,
        )


__all__ = ["IssueCopyStructureEndpoint", "IssueChecklistItemConvertEndpoint", "IssueConvertToChecklistEndpoint"]
