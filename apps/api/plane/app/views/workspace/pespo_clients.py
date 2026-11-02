# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: Configurações do espaço de trabalho › Clientes (só admins). Regras em ``plane.utils.pespo_clients``."""

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import EntityTemplate, PespoClient, Workspace
from plane.utils import pespo_clients as service


def _error(error):
    return Response(
        {"error": error.code, "code": error.code, "params": error.params}, status=status.HTTP_400_BAD_REQUEST
    )


def _client(slug, pk):
    return (
        PespoClient.objects.filter(workspace__slug=slug, pk=pk)
        .prefetch_related("projects", "contracts__categories", "logins")
        .first()
    )


class WorkspacePespoClientsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        clients = PespoClient.objects.filter(workspace__slug=slug).prefetch_related(
            "projects", "contracts__categories", "logins"
        )
        templates = EntityTemplate.objects.filter(workspace__slug=slug, kind="project", project__isnull=True)
        return Response(
            {
                "clients": [service.client_summary(client) for client in clients],
                "project_templates": [{"id": str(t.id), "name": t.name} for t in templates.order_by("name")],
                "categories": service.CATEGORIES,
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        try:
            client, project, logins = service.create_client(workspace, request.data, request.user)
        except service.ClientError as e:
            return _error(e)
        return Response(
            {
                "client": service.client_detail(_client(slug, client.id)),
                "project": {"id": str(project.id), "identifier": project.identifier},
                "logins": logins,
            },
            status=status.HTTP_201_CREATED,
        )


class WorkspacePespoClientDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug, pk):
        client = _client(slug, pk)
        if client is None:
            return Response({"error": "Client not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(service.client_detail(client), status=status.HTTP_200_OK)


class WorkspacePespoClientRenewEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, pk):
        client = _client(slug, pk)
        if client is None:
            return Response({"error": "Client not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            _, balance = service.renew_contract(client, request.data, request.user)
        except service.ClientError as e:
            return _error(e)
        return Response(
            {"client": service.client_detail(_client(slug, pk)), "balance_added": balance}, status=status.HTTP_200_OK
        )


class WorkspacePespoClientLoginsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, pk):
        client = _client(slug, pk)
        if client is None:
            return Response({"error": "Client not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            emails = service.parse_emails(request.data.get("emails"))
        except service.ClientError as e:
            return _error(e)
        if not emails:
            return _error(service.ClientError("EMAILS_REQUIRED"))
        results = service.grant_access(client, emails, request.user)
        return Response(
            {"logins": results, "client": service.client_detail(_client(slug, pk))}, status=status.HTTP_200_OK
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk):
        client = _client(slug, pk)
        if client is None:
            return Response({"error": "Client not found"}, status=status.HTTP_404_NOT_FOUND)
        email = str(request.data.get("email") or "").strip().lower()
        if not email:
            return _error(service.ClientError("EMAILS_REQUIRED"))
        service.revoke_access(client, email)
        return Response(service.client_detail(_client(slug, pk)), status=status.HTTP_200_OK)
