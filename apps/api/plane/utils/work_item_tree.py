# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Pespo: fotografia e recriação da estrutura de um item de trabalho.

Uma *fotografia* (``snapshot_work_item``) é um dict serializável com os campos do item, as
subtarefas do checklist (em árvore), os links e os sub-itens (recursivamente, cada um com a mesma
forma). Ela serve para duas coisas:

- **Copiar um item:** o modal de cópia cria o item novo com os campos que a pessoa editou e depois
  ``apply_structure`` recria embaixo dele as subtarefas, os links e os sub-itens do original.
- **Modelos:** o modelo guarda a fotografia; criar a partir do modelo preenche o modal com os campos e
  recria a estrutura do mesmo jeito.

Regras da recriação:

- Sub-itens nascem no estado padrão do projeto e as subtarefas, desmarcadas: o resultado é um
  começo, não uma cópia do andamento.
- Datas andam juntas: o deslocamento é a diferença entre a "âncora" do original (início, ou entrega
  se não houver início) e a do item novo. Sem âncora dos dois lados, uma cópia mantém as datas e um
  modelo as descarta (``keep_unanchored_dates``).
- Responsáveis só se ainda forem membros do projeto de destino; etiquetas pelo id no mesmo projeto ou
  pelo nome em outro; estimativa só no mesmo projeto.
"""

# Python imports
import json
from datetime import date

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

# Module imports
from plane.bgtasks.copy_s3_object import copy_s3_objects_of_description_and_assets
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    CycleIssue,
    EstimatePoint,
    Issue,
    IssueAssignee,
    IssueChecklistItem,
    IssueLabel,
    IssueLink,
    Label,
    ModuleIssue,
    ProjectMember,
)
from plane.utils.content_validator import validate_html_content

MAX_TREE_DEPTH = 5
MAX_TREE_NODES = 300
CHECKLIST_SORT_STEP = 10000


class WorkItemTreeTooLarge(Exception):
    pass


class _Counter:
    def __init__(self, limit=None):
        self.count = 0
        self.limit = limit if limit is not None else MAX_TREE_NODES

    def add(self, amount=1):
        self.count += amount
        if self.count > self.limit:
            raise WorkItemTreeTooLarge()


def issue_anchor(issue):
    return issue.start_date or issue.target_date


def _iso(value):
    return value.isoformat() if value else None


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


# --- Fotografia -----------------------------------------------------------------


def snapshot_checklist(issue, counter=None):
    rows = list(
        IssueChecklistItem.objects.filter(issue=issue).values("id", "parent_id", "name", "assignee_id", "due_date")
    )
    if counter:
        counter.add(len(rows))
    children_of = {}
    for row in rows:
        children_of.setdefault(row["parent_id"], []).append(row)

    def build(parent_id):
        return [
            {
                "name": row["name"],
                "assignee_id": str(row["assignee_id"]) if row["assignee_id"] else None,
                "due_date": _iso(row["due_date"]),
                "children": build(row["id"]),
            }
            for row in children_of.get(parent_id, [])
        ]

    # A consulta já vem na ordem do modelo (sort_order, created_at), então os irmãos ficam em ordem.
    return build(None)


def snapshot_links(issue):
    return [
        {"title": link.title, "url": link.url} for link in IssueLink.objects.filter(issue=issue).order_by("created_at")
    ]


def snapshot_work_item(issue, depth=0, counter=None):
    """Fotografia do item, das subtarefas, dos links e dos sub-itens (até ``MAX_TREE_DEPTH`` níveis)."""
    counter = counter or _Counter()
    counter.add()
    labels = list(Label.objects.filter(label_issue__issue=issue, label_issue__deleted_at__isnull=True).distinct())
    node = {
        "name": issue.name,
        "description_html": issue.description_html or "<p></p>",
        "priority": issue.priority,
        "start_date": _iso(issue.start_date),
        "target_date": _iso(issue.target_date),
        "estimate_point_id": str(issue.estimate_point_id) if issue.estimate_point_id else None,
        "labels": [{"id": str(label.id), "name": label.name, "color": label.color} for label in labels],
        "assignee_ids": [
            str(user_id)
            for user_id in IssueAssignee.objects.filter(issue=issue, deleted_at__isnull=True).values_list(
                "assignee_id", flat=True
            )
        ],
        "checklist": snapshot_checklist(issue, counter),
        "links": snapshot_links(issue),
        "children": [],
    }
    if depth < MAX_TREE_DEPTH:
        for child in Issue.issue_objects.filter(parent=issue).order_by("sort_order", "created_at"):
            node["children"].append(snapshot_work_item(child, depth + 1, counter))
    return node


def count_nodes(node):
    """Itens + subtarefas de uma fotografia (o item de cima conta)."""

    def checklist_size(rows):
        return sum(1 + checklist_size(row.get("children") or []) for row in rows)

    return 1 + checklist_size(node.get("checklist") or []) + sum(count_nodes(c) for c in node.get("children") or [])


# --- Recriação ------------------------------------------------------------------


class _ProjectContext:
    """O que se resolve uma vez por projeto de destino: membros, etiquetas e estimativas."""

    def __init__(self, project, actor):
        self.project = project
        self.actor = actor
        self.member_ids = {
            str(member_id)
            for member_id in ProjectMember.objects.filter(project=project, is_active=True, role__gte=15).values_list(
                "member_id", flat=True
            )
        }
        labels = list(Label.objects.filter(project=project))
        self.label_ids = {str(label.id) for label in labels}
        self.label_by_name = {label.name.strip().lower(): str(label.id) for label in labels}
        self.estimate_point_ids = {
            str(point_id) for point_id in EstimatePoint.objects.filter(project=project).values_list("id", flat=True)
        }

    def resolve_labels(self, labels):
        resolved = []
        for label in labels or []:
            label_id = label.get("id")
            if label_id in self.label_ids:
                resolved.append(label_id)
                continue
            by_name = self.label_by_name.get((label.get("name") or "").strip().lower())
            if by_name:
                resolved.append(by_name)
        return list(dict.fromkeys(resolved))

    def resolve_assignees(self, assignee_ids):
        return [a for a in dict.fromkeys(assignee_ids or []) if a in self.member_ids]

    def resolve_member(self, user_id):
        return user_id if user_id in self.member_ids else None


def date_shifter(source_anchor, target_anchor, keep_unanchored_dates):
    """Função que leva uma data da fotografia para o item novo (ver docstring do módulo)."""
    source_anchor = _parse_date(source_anchor)
    target_anchor = _parse_date(target_anchor)
    if source_anchor and target_anchor:
        delta = target_anchor - source_anchor
        return lambda value: (_parse_date(value) + delta) if _parse_date(value) else None
    if keep_unanchored_dates:
        return _parse_date
    return lambda value: None


def _create_checklist(issue, rows, ctx, shift):
    if not rows:
        return
    items = []
    workspace_id = ctx.project.workspace_id

    def walk(nodes, parent):
        for index, row in enumerate(nodes):
            item = IssueChecklistItem(
                issue=issue,
                parent=parent,
                project=ctx.project,
                workspace_id=workspace_id,
                name=row.get("name") or "",
                assignee_id=ctx.resolve_member(row.get("assignee_id")),
                due_date=shift(row.get("due_date")),
                sort_order=65535 + index * CHECKLIST_SORT_STEP,
                created_by=ctx.actor,
                updated_by=ctx.actor,
            )
            items.append(item)
            walk(row.get("children") or [], item)

    walk(rows, None)
    # Pais vêm antes dos filhos na lista, e o id já existe antes do INSERT (uuid4).
    IssueChecklistItem.objects.bulk_create(items, batch_size=200)


def _create_links(issue, links, ctx):
    for link in links or []:
        if not link.get("url"):
            continue
        IssueLink.objects.create(
            issue=issue, project=ctx.project, title=link.get("title"), url=link["url"], metadata={}
        )


def _dispatch_created(issue, ctx, assignee_ids, origin):
    issue_id = str(issue.id)
    project_id = str(ctx.project.id)
    actor_id = str(ctx.actor.id)
    requested_data = json.dumps({"assignee_ids": assignee_ids}, cls=DjangoJSONEncoder)
    if "image-component" in (issue.description_html or ""):
        # Imagens da descrição apontam para os arquivos do item original: o item novo ganha cópias.
        slug = ctx.project.workspace.slug
        transaction.on_commit(
            lambda: copy_s3_objects_of_description_and_assets.delay(
                entity_name="ISSUE", entity_identifier=issue_id, project_id=project_id, slug=slug, user_id=actor_id
            )
        )
    transaction.on_commit(
        lambda: issue_activity.delay(
            type="issue.activity.created",
            requested_data=requested_data,
            actor_id=actor_id,
            issue_id=issue_id,
            project_id=project_id,
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=origin,
        )
    )


def create_work_item(node, ctx, shift, parent=None, cycle_id=None, module_ids=None, origin=None, depth=0):
    """Cria um item a partir de uma fotografia, com subtarefas, links e sub-itens. O item nasce no
    estado padrão do projeto."""
    description_html = node.get("description_html") or "<p></p>"
    is_valid, _, sanitized = validate_html_content(description_html)
    if not is_valid:
        description_html = "<p></p>"
    elif sanitized is not None:
        description_html = sanitized

    start_date = shift(node.get("start_date"))
    target_date = shift(node.get("target_date"))
    if start_date and target_date and start_date > target_date:
        start_date = None

    estimate_point_id = node.get("estimate_point_id")
    issue = Issue(
        project=ctx.project,
        parent=parent,
        name=(node.get("name") or "").strip()[:255] or "(sem título)",
        description_html=description_html,
        priority=node.get("priority") or "none",
        start_date=start_date,
        target_date=target_date,
        estimate_point_id=estimate_point_id if estimate_point_id in ctx.estimate_point_ids else None,
    )
    issue.save()
    apply_extras(issue, node, ctx, shift, cycle_id=cycle_id, module_ids=module_ids, origin=origin, depth=depth)
    return issue


def apply_extras(issue, node, ctx, shift, cycle_id=None, module_ids=None, origin=None, depth=0):
    """Responsáveis, etiquetas, ciclo e módulos de um item recém-criado, e a estrutura embaixo dele."""
    workspace_id = ctx.project.workspace_id
    assignee_ids = ctx.resolve_assignees(node.get("assignee_ids"))
    IssueAssignee.objects.bulk_create(
        [
            IssueAssignee(
                issue=issue,
                assignee_id=assignee_id,
                project=ctx.project,
                workspace_id=workspace_id,
                created_by=ctx.actor,
                updated_by=ctx.actor,
            )
            for assignee_id in assignee_ids
        ],
        ignore_conflicts=True,
    )
    IssueLabel.objects.bulk_create(
        [
            IssueLabel(
                issue=issue,
                label_id=label_id,
                project=ctx.project,
                workspace_id=workspace_id,
                created_by=ctx.actor,
                updated_by=ctx.actor,
            )
            for label_id in ctx.resolve_labels(node.get("labels"))
        ],
        ignore_conflicts=True,
    )
    if cycle_id:
        CycleIssue.objects.create(issue=issue, cycle_id=cycle_id, project=ctx.project)
    for module_id in module_ids or []:
        ModuleIssue.objects.create(issue=issue, module_id=module_id, project=ctx.project)
    _dispatch_created(issue, ctx, assignee_ids, origin)
    apply_structure(issue, node, ctx, shift, cycle_id=cycle_id, module_ids=module_ids, origin=origin, depth=depth)


def apply_structure(issue, node, ctx, shift, cycle_id=None, module_ids=None, origin=None, depth=0):
    """Subtarefas, links e sub-itens da fotografia, embaixo de ``issue`` (que já existe). Sub-itens
    entram nos mesmos ciclo/módulos passados (modelos de ciclo e de módulo)."""
    _create_checklist(issue, node.get("checklist") or [], ctx, shift)
    _create_links(issue, node.get("links") or [], ctx)
    if depth >= MAX_TREE_DEPTH:
        return
    for child in node.get("children") or []:
        create_work_item(
            child, ctx, shift, parent=issue, cycle_id=cycle_id, module_ids=module_ids, origin=origin, depth=depth + 1
        )


def project_context(project, actor):
    return _ProjectContext(project, actor)


def next_checklist_sort_order(issue):
    largest = IssueChecklistItem.objects.filter(issue=issue, parent=None).aggregate(largest=Max("sort_order"))[
        "largest"
    ]
    return (largest + CHECKLIST_SORT_STEP) if largest is not None else 65535


__all__ = [
    "MAX_TREE_DEPTH",
    "MAX_TREE_NODES",
    "WorkItemTreeTooLarge",
    "apply_extras",
    "apply_structure",
    "count_nodes",
    "create_work_item",
    "date_shifter",
    "issue_anchor",
    "next_checklist_sort_order",
    "project_context",
    "snapshot_work_item",
]
