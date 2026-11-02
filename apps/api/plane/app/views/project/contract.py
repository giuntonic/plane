# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: o contrato do cliente do projeto, só para ver (Configurações do projeto › Contrato).

Mostra de onde o Hub lê o contrato agora (``PESPO_CONTRACTS_SOURCE``), o contrato que o painel de peças usa e o
que já foi importado do portal para o Hub, com o histórico. Novo cliente e renovação continuam no painel admin."""

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import PespoClient, Project
from plane.utils.portal_contracts import PortalUnavailable, contracts_source, get_project_contract


class ProjectContractEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            current = get_project_contract(project.id)
            current_status = "ok" if current else "no_client"
        except PortalUnavailable:
            current, current_status = None, "unavailable"

        hub = None
        client = PespoClient.objects.filter(projects=project).order_by("created_at").first()
        if client is not None:
            hub = {
                "client": {"id": str(client.id), "name": client.name, "portal_client_id": client.portal_client_id},
                "contracts": [
                    {
                        "id": str(contract.id),
                        "contract_type": contract.contract_type,
                        "start_date": contract.start_date,
                        "end_date": contract.end_date,
                        "status": contract.status,
                        "urgent_limit": contract.urgent_limit,
                        "expiry_notice_sent_at": contract.expiry_notice_sent_at,
                        "categories": [
                            {"category": category.category, "contracted": category.contracted}
                            for category in sorted(contract.categories.all(), key=lambda c: c.category)
                        ],
                    }
                    for contract in client.contracts.prefetch_related("categories").order_by("-start_date")
                ],
                "imported_at": client.updated_at,
            }
        return Response(
            {"source": contracts_source(), "current_status": current_status, "current": current, "hub": hub},
            status=status.HTTP_200_OK,
        )
