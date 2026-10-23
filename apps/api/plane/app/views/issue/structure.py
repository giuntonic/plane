# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: estrutura do item de trabalho (cópia com subtarefas e sub-itens, e subtarefa que vira item).
As regras da recriação estão em ``plane.utils.work_item_tree``."""

# Django imports
from django.db import transaction

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Issue, IssueChecklistItem, Project, ProjectMember, State
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
        line = IssueChecklistItem.objects.filter(issue=issue, pk=pk).first() if issue else None
        if not line:
            return Response({"error": "Checklist item not found"}, status=status.HTTP_404_NOT_FOUND)

        project = Project.objects.get(pk=project_id)
        as_sub_item = request.data.get("as_sub_item", True) is not False
        state = None
        if line.is_completed:
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
            IssueChecklistItem.objects.filter(pk__in=descendants).update(issue=new_issue)
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


__all__ = ["IssueCopyStructureEndpoint", "IssueChecklistItemConvertEndpoint"]
