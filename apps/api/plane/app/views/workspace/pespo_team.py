# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: funções e serviços da equipe (Configurações do espaço de trabalho › Equipe, só admins) e o atalho
"Serviços" do topo (``…/team-services/mine/``, para a equipe)."""

# Django imports
from django.core.exceptions import ValidationError
from django.core.validators import URLValidator

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import TeamRole, TeamService, Workspace, WorkspaceMember


def _service(service):
    return {
        "id": str(service.id),
        "name": service.name,
        "url": service.url,
        "icon": service.icon,
        "description": service.description,
        "sort_order": service.sort_order,
    }


def _role(role):
    return {
        "id": str(role.id),
        "name": role.name,
        "description": role.description,
        "service_ids": [str(s.id) for s in role.services.all()],
        "member_ids": [str(m.id) for m in role.members.all()],
    }


def _bad(code):
    return Response({"error": code, "code": code}, status=status.HTTP_400_BAD_REQUEST)


def _clean_service(data, current=None):
    name = str(data.get("name", current.name if current else "") or "").strip()[:255]
    url = str(data.get("url", current.url if current else "") or "").strip()
    if not name:
        return None, "NAME_REQUIRED"
    try:
        URLValidator(schemes=["http", "https"])(url)
    except ValidationError:
        return None, "INVALID_URL"
    try:
        sort_order = int(data.get("sort_order", current.sort_order if current else 0) or 0)
    except (TypeError, ValueError):
        sort_order = 0
    return {
        "name": name,
        "url": url,
        "icon": str(data.get("icon", current.icon if current else "🔧") or "🔧")[:16],
        "description": str(data.get("description", current.description if current else "") or "")[:500],
        "sort_order": sort_order,
    }, None


def _set_role_links(role, data, workspace_id):
    if "service_ids" in data:
        role.services.set(TeamService.objects.filter(workspace_id=workspace_id, pk__in=data.get("service_ids") or []))
    if "member_ids" in data:
        # só a equipe (membro ou admin) tem função
        members = WorkspaceMember.objects.filter(
            workspace_id=workspace_id, member_id__in=data.get("member_ids") or [], is_active=True, role__gte=15
        ).values_list("member_id", flat=True)
        role.members.set(list(members))


class TeamCatalogEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        return Response(
            {
                "services": [_service(s) for s in TeamService.objects.filter(workspace__slug=slug)],
                "roles": [
                    _role(r)
                    for r in TeamRole.objects.filter(workspace__slug=slug).prefetch_related("services", "members")
                ],
            },
            status=status.HTTP_200_OK,
        )


class TeamServicesEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        fields, error = _clean_service(request.data)
        if error:
            return _bad(error)
        service = TeamService.objects.create(workspace=workspace, **fields)
        return Response(_service(service), status=status.HTTP_201_CREATED)


class TeamServiceDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, pk):
        service = TeamService.objects.filter(workspace__slug=slug, pk=pk).first()
        if service is None:
            return Response({"error": "Service not found"}, status=status.HTTP_404_NOT_FOUND)
        fields, error = _clean_service(request.data, current=service)
        if error:
            return _bad(error)
        for name, value in fields.items():
            setattr(service, name, value)
        service.save()
        return Response(_service(service), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk):
        TeamService.objects.filter(workspace__slug=slug, pk=pk).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamRolesEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        name = str(request.data.get("name") or "").strip()[:255]
        if not name:
            return _bad("NAME_REQUIRED")
        if TeamRole.objects.filter(workspace=workspace, name__iexact=name).exists():
            return _bad("ROLE_NAME_TAKEN")
        role = TeamRole.objects.create(
            workspace=workspace, name=name, description=str(request.data.get("description") or "")[:500]
        )
        _set_role_links(role, request.data, workspace.id)
        return Response(_role(role), status=status.HTTP_201_CREATED)


class TeamRoleDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, pk):
        role = TeamRole.objects.filter(workspace__slug=slug, pk=pk).first()
        if role is None:
            return Response({"error": "Role not found"}, status=status.HTTP_404_NOT_FOUND)
        if "name" in request.data:
            name = str(request.data.get("name") or "").strip()[:255]
            if not name:
                return _bad("NAME_REQUIRED")
            if TeamRole.objects.filter(workspace_id=role.workspace_id, name__iexact=name).exclude(pk=role.pk).exists():
                return _bad("ROLE_NAME_TAKEN")
            role.name = name
        if "description" in request.data:
            role.description = str(request.data.get("description") or "")[:500]
        role.save()
        _set_role_links(role, request.data, role.workspace_id)
        return Response(_role(role), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk):
        TeamRole.objects.filter(workspace__slug=slug, pk=pk).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyTeamServicesEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        services = TeamService.objects.filter(workspace__slug=slug)
        is_admin = WorkspaceMember.objects.filter(
            workspace__slug=slug, member=request.user, is_active=True, role=20
        ).exists()
        if not is_admin:
            services = services.filter(roles__members=request.user, roles__deleted_at__isnull=True).distinct()
        return Response([_service(s) for s in services], status=status.HTTP_200_OK)
