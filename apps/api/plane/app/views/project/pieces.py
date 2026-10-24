# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: painel de peças do projeto (substitui o embed do Metabase), pedido de peças novas e pedido
de refação. Regras em ``plane.utils.pieces``; contrato lido do portal em ``plane.utils.portal_contracts``."""

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Issue, Project, ProjectMember
from plane.utils.host import base_host
from plane.utils.pieces import (
    PieceRequestError,
    availability,
    load_project_issues,
    panel,
    parse_request_items,
    request_pieces,
    request_rework,
)
from plane.utils.portal_contracts import PortalUnavailable, get_project_contract


def _contract_or_status(project_id):
    """(dados do cliente, status): status é "ok", "no_client" (projeto não ligado a cliente) ou
    "unavailable" (sem acesso ao banco do portal)."""
    try:
        client = get_project_contract(project_id)
    except PortalUnavailable:
        return None, "unavailable"
    if client is None:
        return None, "no_client"
    return client, "ok"


def _error(error, http_status=status.HTTP_400_BAD_REQUEST):
    return Response({"error": error.code, "code": error.code, "params": error.params}, status=http_status)


def _is_guest(user, project_id):
    member = ProjectMember.objects.filter(project_id=project_id, member=user, is_active=True).first()
    return not member or member.role < 15


class ProjectPiecesPanelEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        client, contract_status = _contract_or_status(project.id)
        contract = client["contract"] if client else None
        issues = load_project_issues(project)
        expiring = client["expiring"] if client else None
        return Response(
            {
                "contract_status": contract_status,
                "client_name": client["client_name"] if client else None,
                "contract": contract,
                "expiring": expiring
                if expiring and expiring["days_left"] is not None and expiring["days_left"] <= 14
                else None,
                "availability": availability(contract, issues),
                **panel(project, contract, issues),
            },
            status=status.HTTP_200_OK,
        )


class ProjectPiecesRequestEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        try:
            items = parse_request_items(request.data.get("items"))
        except PieceRequestError as e:
            return _error(e)
        client, contract_status = _contract_or_status(project.id)
        if contract_status == "unavailable":
            return Response(
                {"error": "PORTAL_UNAVAILABLE", "code": "PORTAL_UNAVAILABLE", "params": {}},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        try:
            created = request_pieces(
                project,
                request.user,
                client["contract"] if client else None,
                items,
                request.data.get("briefing"),
                is_guest=_is_guest(request.user, project.id),
                origin=base_host(request=request, is_app=True),
            )
        except PieceRequestError as e:
            return _error(e)
        return Response({"created": created}, status=status.HTTP_201_CREATED)


class IssueReworkRequestEndpoint(BaseAPIView):
    """O cliente (convidado) ou a equipe pede refação de uma peça, pela Marcação da Peça."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id, issue_id):
        issue = (
            Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id)
            .select_related("project")
            .first()
        )
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        # Convidado sem "ver tudo" só enxerga os itens que criou (regra do Plane).
        if (
            _is_guest(request.user, project_id)
            and not issue.project.guest_view_all_features
            and issue.created_by_id != request.user.id
        ):
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            result = request_rework(
                issue, request.user, request.data.get("reason"), origin=base_host(request=request, is_app=True)
            )
        except PieceRequestError as e:
            return _error(e)
        return Response(result, status=status.HTTP_200_OK)
