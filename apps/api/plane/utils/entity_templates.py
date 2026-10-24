# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Pespo: fotografia e aplicação dos modelos (``EntityTemplate``).

| Tipo        | Fotografia                                              | Aplicar                                   |
|-------------|---------------------------------------------------------|-------------------------------------------|
| work_item   | item + subtarefas + links + sub-itens                   | embaixo do item que o modal acabou de criar |
| module      | nome, descrição, duração e os itens do módulo           | itens dentro do módulo que o modal criou  |
| cycle       | nome, descrição, duração e os itens do ciclo            | itens dentro do ciclo que o modal criou   |
| page        | nome e conteúdo                                         | cria a página                             |
| project     | recursos, estados, etiquetas, módulos e (opcional) itens | dentro do projeto que o modal criou       |

As datas dos itens andam junto com a âncora (início do módulo/ciclo, ou do item): sem âncora no
destino, os itens nascem sem datas. Modelos de projeto não levam datas.
"""

# Django imports
from django.db import transaction
from django.db.models import Exists, Max, OuterRef

# Module imports
from plane.bgtasks.copy_s3_object import copy_s3_objects_of_description_and_assets
from plane.db.models import Issue, Label, Module, ModuleIssue, Page, ProjectPage, State
from plane.utils.content_validator import validate_html_content
from plane.utils.work_item_tree import (
    _Counter,
    apply_structure,
    count_nodes,
    create_work_item,
    date_shifter,
    issue_anchor,
    project_context,
    snapshot_work_item,
)

PROJECT_FEATURES = ("module_view", "cycle_view", "issue_views_view", "page_view", "intake_view")


def _iso(value):
    if not value:
        return None
    return value.date().isoformat() if hasattr(value, "date") and callable(value.date) else value.isoformat()


def _duration_days(start, end):
    if not start or not end:
        return None
    start = start.date() if hasattr(start, "date") and callable(start.date) else start
    end = end.date() if hasattr(end, "date") and callable(end.date) else end
    return max((end - start).days, 0)


def _top_level(issues):
    """Itens cujo pai não está no mesmo conjunto (os filhos vêm pela fotografia do pai)."""
    ids = {issue.id for issue in issues}
    return [issue for issue in issues if issue.parent_id not in ids]


def _snapshot_items(issues, counter):
    return [snapshot_work_item(issue, counter=counter) for issue in _top_level(issues)]


# --- Fotografias ----------------------------------------------------------------


def snapshot_issue_template(issue):
    node = snapshot_work_item(issue)
    node["anchor"] = _iso(issue_anchor(issue))
    node["source_project_id"] = str(issue.project_id)
    return node


def snapshot_module(module, counter=None, include_items=True):
    counter = counter or _Counter()
    issues = []
    if include_items:
        issues = list(
            Issue.issue_objects.filter(issue_module__module=module, issue_module__deleted_at__isnull=True)
            .order_by("sort_order", "created_at")
            .distinct()
        )
    return {
        "module": {
            "name": module.name,
            "description": module.description or "",
            "duration_days": _duration_days(module.start_date, module.target_date),
        },
        "anchor": _iso(module.start_date),
        "work_items": _snapshot_items(issues, counter),
    }


def snapshot_cycle(cycle):
    counter = _Counter()
    issues = list(
        Issue.issue_objects.filter(issue_cycle__cycle=cycle, issue_cycle__deleted_at__isnull=True)
        .order_by("sort_order", "created_at")
        .distinct()
    )
    return {
        "cycle": {
            "name": cycle.name,
            "description": cycle.description or "",
            "duration_days": _duration_days(cycle.start_date, cycle.end_date),
        },
        "anchor": _iso(cycle.start_date),
        "work_items": _snapshot_items(issues, counter),
    }


def snapshot_page(page):
    return {
        "page": {
            "name": page.name,
            "description_html": page.description_html or "<p></p>",
            "logo_props": page.logo_props,
        }
    }


def snapshot_project(project, include_items=True):
    counter = _Counter()
    states = State.objects.filter(project=project).order_by("sequence")
    labels = list(Label.objects.filter(project=project).select_related("parent").order_by("sort_order"))
    modules = Module.objects.filter(project=project, archived_at__isnull=True).order_by("sort_order")
    data = {
        "project": {
            "description": project.description or "",
            "features": {feature: getattr(project, feature) for feature in PROJECT_FEATURES},
        },
        "states": [
            {
                "name": state.name,
                "group": state.group,
                "color": state.color,
                "description": state.description or "",
                "default": state.default,
            }
            for state in states
        ],
        "labels": [
            {"name": label.name, "color": label.color, "parent": label.parent.name if label.parent else None}
            for label in labels
        ],
        "modules": [snapshot_module(module, counter, include_items=include_items) for module in modules],
        "work_items": [],
    }
    if include_items:
        in_module = ModuleIssue.objects.filter(issue=OuterRef("pk"), deleted_at__isnull=True)
        loose = list(
            Issue.issue_objects.filter(project=project).exclude(Exists(in_module)).order_by("sort_order", "created_at")
        )
        data["work_items"] = _snapshot_items(loose, counter)
    return data


# --- Aplicação ------------------------------------------------------------------


def apply_work_item_template(data, issue, actor, origin=None):
    ctx = project_context(issue.project, actor)
    shift = date_shifter(data.get("anchor"), issue_anchor(issue), keep_unanchored_dates=False)
    apply_structure(issue, data, ctx, shift, origin=origin)


def _create_items(items, project, actor, anchor, target_anchor, cycle_id=None, module_ids=None, origin=None):
    ctx = project_context(project, actor)
    shift = date_shifter(anchor, target_anchor, keep_unanchored_dates=False)
    for node in items or []:
        create_work_item(node, ctx, shift, cycle_id=cycle_id, module_ids=module_ids, origin=origin)


def apply_module_template(data, module, actor, origin=None):
    _create_items(
        data.get("work_items"),
        module.project,
        actor,
        data.get("anchor"),
        module.start_date,
        module_ids=[module.id],
        origin=origin,
    )


def apply_cycle_template(data, cycle, actor, origin=None):
    _create_items(
        data.get("work_items"),
        cycle.project,
        actor,
        data.get("anchor"),
        cycle.start_date.date() if cycle.start_date else None,
        cycle_id=cycle.id,
        origin=origin,
    )


def create_page_from_template(data, project, actor, name=None):
    page_data = data.get("page") or {}
    description_html = page_data.get("description_html") or "<p></p>"
    is_valid, _, sanitized = validate_html_content(description_html)
    if not is_valid:
        description_html = "<p></p>"
    elif sanitized is not None:
        description_html = sanitized
    page = Page.objects.create(
        workspace_id=project.workspace_id,
        name=(name or page_data.get("name") or "").strip(),
        description_html=description_html,
        logo_props=page_data.get("logo_props") or {},
        owned_by=actor,
    )
    ProjectPage.objects.create(workspace_id=project.workspace_id, project=project, page=page)
    if "image-component" in description_html:
        # As imagens do modelo apontam para os arquivos da página original: a página nova ganha cópias.
        page_id, project_id, slug, user_id = page.id, project.id, project.workspace.slug, actor.id
        transaction.on_commit(
            lambda: copy_s3_objects_of_description_and_assets.delay(
                entity_name="PAGE", entity_identifier=page_id, project_id=project_id, slug=slug, user_id=user_id
            )
        )
    return page


def _apply_states(states, project):
    """Cria os estados do modelo que faltam (pelo nome) e marca o padrão. Num projeto ainda vazio, os
    estados padrão do Plane que o modelo não tem saem."""
    if not states:
        return
    existing = {state.name.strip().lower(): state for state in State.objects.filter(project=project)}
    next_sequence = (State.objects.filter(project=project).aggregate(largest=Max("sequence"))["largest"] or 0) + 15000
    kept = set()
    default_state = None
    for template_state in states:
        key = (template_state.get("name") or "").strip().lower()
        if not key:
            continue
        state = existing.get(key)
        if not state:
            state = State.objects.create(
                project=project,
                name=template_state["name"].strip(),
                group=template_state.get("group") or "backlog",
                color=template_state.get("color") or "#60646C",
                description=template_state.get("description") or "",
                sequence=next_sequence,
            )
            next_sequence += 15000
            existing[key] = state
        kept.add(state.id)
        if template_state.get("default"):
            default_state = state

    if default_state and not default_state.default:
        State.objects.filter(project=project, default=True).update(default=False)
        default_state.default = True
        default_state.save(update_fields=["default"])

    if not Issue.all_objects.filter(project=project).exists():
        for state in State.objects.filter(project=project, is_triage=False).exclude(pk__in=kept):
            if not state.default:
                state.delete()


def _apply_labels(labels, project):
    existing = {label.name.strip().lower(): label for label in Label.objects.filter(project=project)}
    pending = list(labels or [])
    # Pais antes dos filhos (no máximo dois níveis no Plane, mas sem contar com isso).
    for _ in range(3):
        remaining = []
        for template_label in pending:
            key = (template_label.get("name") or "").strip().lower()
            if not key or key in existing:
                continue
            parent_name = (template_label.get("parent") or "").strip().lower()
            if parent_name and parent_name not in existing:
                remaining.append(template_label)
                continue
            existing[key] = Label.objects.create(
                project=project,
                workspace_id=project.workspace_id,
                name=template_label["name"].strip(),
                color=template_label.get("color") or "",
                parent=existing.get(parent_name) if parent_name else None,
            )
        pending = remaining


def apply_project_template(data, project, actor, origin=None):
    features = (data.get("project") or {}).get("features") or {}
    changed = []
    for feature in PROJECT_FEATURES:
        if feature in features and getattr(project, feature) != bool(features[feature]):
            setattr(project, feature, bool(features[feature]))
            changed.append(feature)
    description = (data.get("project") or {}).get("description")
    if description and not project.description:
        project.description = description
        changed.append("description")
    if changed:
        project.save(update_fields=changed)

    _apply_states(data.get("states"), project)
    _apply_labels(data.get("labels"), project)

    existing_modules = {module.name.strip().lower() for module in Module.objects.filter(project=project)}
    for module_data in data.get("modules") or []:
        name = ((module_data.get("module") or {}).get("name") or "").strip()
        if not name or name.lower() in existing_modules:
            continue
        module = Module.objects.create(
            project=project, name=name, description=(module_data.get("module") or {}).get("description") or ""
        )
        existing_modules.add(name.lower())
        _create_items(module_data.get("work_items"), project, actor, None, None, module_ids=[module.id], origin=origin)

    _create_items(data.get("work_items"), project, actor, None, None, origin=origin)


def count_template_nodes(kind, data):
    if kind == "work_item":
        return count_nodes(data)
    if kind in ("module", "cycle"):
        return sum(count_nodes(node) for node in data.get("work_items") or [])
    if kind == "project":
        return sum(count_nodes(node) for node in data.get("work_items") or []) + sum(
            count_nodes(node) for module in data.get("modules") or [] for node in module.get("work_items") or []
        )
    return 0


__all__ = [
    "apply_cycle_template",
    "apply_module_template",
    "apply_project_template",
    "apply_work_item_template",
    "count_template_nodes",
    "create_page_from_template",
    "snapshot_cycle",
    "snapshot_issue_template",
    "snapshot_module",
    "snapshot_page",
    "snapshot_project",
]
