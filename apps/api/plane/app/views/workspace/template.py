# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: modelos de item de trabalho, módulo, ciclo, página e projeto (``EntityTemplate``).

- ``GET  workspaces/<slug>/templates/?kind=&project_id=`` lista (sem a fotografia).
- ``POST workspaces/<slug>/templates/`` salva um modelo a partir de uma entidade existente
  (``kind``, ``source_id``, ``name``, ``description``, ``project_only``, ``include_work_items``).
- ``GET/PATCH/DELETE workspaces/<slug>/templates/<id>/``; o GET com ``project_id`` traz o
  ``prefill`` do formulário de criação já resolvido para aquele projeto.
- ``POST workspaces/<slug>/templates/<id>/apply/`` aplica o modelo (ver
  ``plane.utils.entity_templates``).

Quem salva escolhe se o modelo vale só no projeto de origem ou no workspace inteiro. Quem pode
criar a entidade num projeto pode usar os modelos daquele projeto e os do workspace. Editar e
apagar: quem criou ou admin do workspace."""

# Django imports
from django.db import transaction
from django.db.models import Q

# Third party imports
from rest_framework import serializers, status
from rest_framework.response import Response

# Module imports
from ..base import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import (
    Cycle,
    EntityTemplate,
    Issue,
    Module,
    Page,
    Project,
    ProjectMember,
    Workspace,
    WorkspaceMember,
)
from plane.utils.entity_templates import (
    apply_cycle_template,
    apply_module_template,
    apply_project_template,
    apply_work_item_template,
    count_template_nodes,
    create_page_from_template,
    snapshot_cycle,
    snapshot_issue_template,
    snapshot_module,
    snapshot_page,
    snapshot_project,
)
from plane.utils.host import base_host
from plane.utils.work_item_tree import MAX_TREE_NODES, WorkItemTreeTooLarge, project_context

KINDS = {choice for choice, _ in EntityTemplate.Kind.choices}


class EntityTemplateSerializer(serializers.ModelSerializer):
    summary = serializers.SerializerMethodField()

    class Meta:
        model = EntityTemplate
        fields = [
            "id",
            "workspace",
            "project",
            "kind",
            "name",
            "description",
            "summary",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_summary(self, obj):
        data = obj.data or {}
        summary = {"work_items": count_template_nodes(obj.kind, data) if obj.kind != "page" else 0}
        if obj.kind == "project":
            summary["states"] = len(data.get("states") or [])
            summary["labels"] = len(data.get("labels") or [])
            summary["modules"] = len(data.get("modules") or [])
        return summary


def _is_project_editor(user, project_id):
    return ProjectMember.objects.filter(project_id=project_id, member=user, is_active=True, role__gte=15).exists()


def _visible_templates(slug, user):
    return EntityTemplate.objects.filter(workspace__slug=slug).filter(
        Q(project__isnull=True)
        | Q(project__project_projectmember__member=user, project__project_projectmember__is_active=True)
    )


def _too_large():
    return Response(
        {"error": f"Too many work items and sub-tasks (max {MAX_TREE_NODES})", "code": "TEMPLATE_TOO_LARGE"},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _resolve_source(kind, slug, source_id, user):
    """(entidade, projeto) ou (None, None). A pessoa precisa poder editar no projeto de origem."""
    if kind == "work_item":
        source = Issue.issue_objects.filter(workspace__slug=slug, pk=source_id).first()
    elif kind == "module":
        source = Module.objects.filter(workspace__slug=slug, pk=source_id).first()
    elif kind == "cycle":
        source = Cycle.objects.filter(workspace__slug=slug, pk=source_id).first()
    elif kind == "page":
        page = Page.objects.filter(workspace__slug=slug, pk=source_id).first()
        if page and page.access == Page.PRIVATE_ACCESS and page.owned_by_id != user.id:
            page = None
        project_page = page.project_pages.filter(deleted_at__isnull=True).first() if page else None
        if not project_page or not _is_project_editor(user, project_page.project_id):
            return None, None
        return page, project_page.project
    else:
        source = Project.objects.filter(workspace__slug=slug, pk=source_id, archived_at__isnull=True).first()
        if not source or not _is_project_editor(user, source.id):
            return None, None
        return source, source
    if not source or not _is_project_editor(user, source.project_id):
        return None, None
    return source, source.project


def _snapshot(kind, source, include_work_items):
    if kind == "work_item":
        return snapshot_issue_template(source)
    if kind == "module":
        return snapshot_module(source)
    if kind == "cycle":
        return snapshot_cycle(source)
    if kind == "page":
        return snapshot_page(source)
    return snapshot_project(source, include_items=include_work_items)


def _prefill(template, project):
    data = template.data or {}
    if template.kind == "work_item":
        ctx = project_context(project, None)
        estimate_point_id = data.get("estimate_point_id")
        return {
            "name": data.get("name") or "",
            "description_html": data.get("description_html") or "<p></p>",
            "priority": data.get("priority") or "none",
            "label_ids": ctx.resolve_labels(data.get("labels")),
            "assignee_ids": ctx.resolve_assignees(data.get("assignee_ids")),
            "estimate_point": estimate_point_id if estimate_point_id in ctx.estimate_point_ids else None,
        }
    if template.kind in ("module", "cycle"):
        entity = data.get(template.kind) or {}
        return {
            "name": entity.get("name") or "",
            "description": entity.get("description") or "",
            "duration_days": entity.get("duration_days"),
        }
    if template.kind == "page":
        return {"name": (data.get("page") or {}).get("name") or ""}
    return {}


class EntityTemplateEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        templates = _visible_templates(slug, request.user)
        kind = request.GET.get("kind")
        if kind:
            templates = templates.filter(kind=kind)
        project_id = request.GET.get("project_id")
        if project_id:
            templates = templates.filter(Q(project_id=project_id) | Q(project__isnull=True))
        templates = templates.distinct().order_by("name", "created_at")
        return Response(EntityTemplateSerializer(templates, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        kind = request.data.get("kind")
        if kind not in KINDS:
            return Response({"error": "Invalid kind"}, status=status.HTTP_400_BAD_REQUEST)
        source, source_project = _resolve_source(kind, slug, request.data.get("source_id"), request.user)
        if not source:
            return Response({"error": "Source not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            data = _snapshot(kind, source, request.data.get("include_work_items", True) is not False)
        except WorkItemTreeTooLarge:
            return _too_large()

        name = (request.data.get("name") or getattr(source, "name", "") or "").strip()[:255]
        if not name:
            return Response({"error": "Name is required"}, status=status.HTTP_400_BAD_REQUEST)
        project_only = kind != "project" and request.data.get("project_only", True) is not False
        template = EntityTemplate.objects.create(
            workspace=Workspace.objects.get(slug=slug),
            project=source_project if project_only else None,
            kind=kind,
            name=name,
            description=(request.data.get("description") or "").strip(),
            data=data,
        )
        return Response(EntityTemplateSerializer(template).data, status=status.HTTP_201_CREATED)


class EntityTemplateDetailEndpoint(BaseAPIView):
    def _get(self, slug, pk, user):
        return _visible_templates(slug, user).filter(pk=pk).distinct().first()

    def _can_manage(self, template, user, slug):
        if template.created_by_id == user.id:
            return True
        return WorkspaceMember.objects.filter(workspace__slug=slug, member=user, role=20, is_active=True).exists()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, pk):
        template = self._get(slug, pk, request.user)
        if not template:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
        payload = EntityTemplateSerializer(template).data
        project_id = request.GET.get("project_id")
        if project_id:
            project = Project.objects.filter(workspace__slug=slug, pk=project_id).first()
            if not project or not _is_project_editor(request.user, project.id):
                return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
            payload["prefill"] = _prefill(template, project)
        return Response(payload, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def patch(self, request, slug, pk):
        template = self._get(slug, pk, request.user)
        if not template:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
        if not self._can_manage(template, request.user, slug):
            return Response({"error": "Only the author or an admin can edit"}, status=status.HTTP_403_FORBIDDEN)
        fields = []
        if "name" in request.data:
            name = (request.data.get("name") or "").strip()[:255]
            if not name:
                return Response({"error": "Name is required"}, status=status.HTTP_400_BAD_REQUEST)
            template.name = name
            fields.append("name")
        if "description" in request.data:
            template.description = (request.data.get("description") or "").strip()
            fields.append("description")
        # O escopo só pode abrir para o workspace (o projeto de origem não é guardado à parte).
        if request.data.get("project_only") is False and template.project_id:
            template.project = None
            fields.append("project")
        if fields:
            template.save(update_fields=[*fields, "updated_at", "updated_by"])
        return Response(EntityTemplateSerializer(template).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, pk):
        template = self._get(slug, pk, request.user)
        if not template:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
        if not self._can_manage(template, request.user, slug):
            return Response({"error": "Only the author or an admin can delete"}, status=status.HTTP_403_FORBIDDEN)
        template.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class EntityTemplateApplyEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, pk):
        template = _visible_templates(slug, request.user).filter(pk=pk).distinct().first()
        if not template:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
        project = Project.objects.filter(workspace__slug=slug, pk=request.data.get("project_id")).first()
        if not project or not _is_project_editor(request.user, project.id):
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if template.project_id and template.project_id != project.id:
            return Response({"error": "Template belongs to another project"}, status=status.HTTP_400_BAD_REQUEST)

        origin = base_host(request=request, is_app=True)
        data = template.data or {}
        result = {}
        with transaction.atomic():
            if template.kind == "work_item":
                issue = Issue.issue_objects.filter(project=project, pk=request.data.get("issue_id")).first()
                if not issue:
                    return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
                apply_work_item_template(data, issue, request.user, origin=origin)
                result = {"issue_id": str(issue.id)}
            elif template.kind == "module":
                module = Module.objects.filter(project=project, pk=request.data.get("module_id")).first()
                if not module:
                    return Response({"error": "Module not found"}, status=status.HTTP_404_NOT_FOUND)
                apply_module_template(data, module, request.user, origin=origin)
                result = {"module_id": str(module.id)}
            elif template.kind == "cycle":
                cycle = Cycle.objects.filter(project=project, pk=request.data.get("cycle_id")).first()
                if not cycle:
                    return Response({"error": "Cycle not found"}, status=status.HTTP_404_NOT_FOUND)
                apply_cycle_template(data, cycle, request.user, origin=origin)
                result = {"cycle_id": str(cycle.id)}
            elif template.kind == "page":
                page = create_page_from_template(data, project, request.user, name=request.data.get("name"))
                result = {"page_id": str(page.id)}
            else:
                apply_project_template(data, project, request.user, origin=origin)
                result = {"project_id": str(project.id)}
        return Response(result, status=status.HTTP_201_CREATED)
