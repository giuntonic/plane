# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: Acervo da peça (Nextcloud) no item: os links de envio e de entrega e o que tem nas pastas.

A equipe (admin e membro) gera, renova e revoga os dois links e abre a pasta no Arquivos. O cliente (convidado)
vê os links ativos e o que tem em ``Recebido/`` e ``Entrega/``, e pode gerar sozinho o link de envio. Convidado
sem "ver tudo" só alcança os itens que criou (regra do Plane). As regras ficam em ``plane/utils/acervo.py``."""

# Python imports
import logging
from datetime import timedelta

# Django imports
from django.conf import settings

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Issue, IssueAcervoLink, ProjectMember
from plane.utils import acervo
from plane.utils.nextcloud import NextcloudError

logger = logging.getLogger("plane.api")

DISABLED = {"error": "ACERVO_DISABLED"}
UNAVAILABLE = {"error": "ACERVO_UNAVAILABLE"}


def _role(user, project_id):
    return (
        ProjectMember.objects.filter(project_id=project_id, member=user, is_active=True)
        .values_list("role", flat=True)
        .first()
    )


def _visible_issue(request, slug, project_id, issue_id):
    """``(item, papel)``; item ``None`` se não existe ou se o convidado não pode vê-lo."""
    issue = (
        Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id)
        .select_related("project", "project__workspace")
        .first()
    )
    role = _role(request.user, project_id)
    if issue is None:
        return None, role
    if (
        role == ROLE.GUEST.value
        and not issue.project.guest_view_all_features
        and issue.created_by_id != request.user.id
    ):
        return None, role
    return issue, role


def _unavailable(error):
    logger.warning("Acervo: Nextcloud indisponível: %s", error)
    return Response(UNAVAILABLE, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class IssueAcervoEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue, role = _visible_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        is_team = role != ROLE.GUEST.value
        data = {
            "enabled": acervo.is_enabled(),
            "is_team": is_team,
            "folder": None,
            "links": [],
            "received": [],
            "delivery": [],
            "unavailable": False,
        }
        if not data["enabled"]:
            return Response(data, status=status.HTTP_200_OK)

        today = acervo.today_for(issue.project)
        # O mais novo de cada tipo (a equipe vê também o vencido, para renovar; o cliente, só o ativo).
        newest = {}
        for link in IssueAcervoLink.objects.filter(issue=issue, revoked_at__isnull=True).order_by("-created_at"):
            if link.kind in newest or (not is_team and not acervo.link_is_active(link, today)):
                continue
            newest[link.kind] = link
        data["links"] = [
            acervo.link_data(newest[kind], today, include_folder=is_team)
            for kind in acervo.KIND_FOLDER
            if kind in newest
        ]

        folder = acervo.get_issue_folder(issue)
        if folder is not None:
            if is_team:
                data["folder"] = {"path": folder.path, "files_url": acervo.files_url(folder.path)}
            try:
                data.update(acervo.list_issue_files(folder, acervo.get_client()))
            except NextcloudError as e:
                logger.warning("Acervo: listagem da peça %s falhou: %s", issue.id, e)
                data["unavailable"] = True
        return Response(data, status=status.HTTP_200_OK)


class IssueAcervoFolderEndpoint(BaseAPIView):
    """Cria a pasta da peça agora (o "Abrir no Arquivos" de uma peça que ainda não tem pasta)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue, _ = _visible_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        if not acervo.is_enabled():
            return Response(DISABLED, status=status.HTTP_400_BAD_REQUEST)
        try:
            folder = acervo.ensure_issue_folder(issue, acervo.get_client())
        except NextcloudError as e:
            return _unavailable(e)
        return Response({"path": folder.path, "files_url": acervo.files_url(folder.path)}, status=status.HTTP_200_OK)


class IssueAcervoLinkEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id, issue_id):
        """``kind``: ``upload`` ou ``delivery``. Devolve o link ativo do tipo, se já houver (200), ou um novo (201)."""
        kind = request.data.get("kind")
        if kind not in IssueAcervoLink.Kind.values:
            return Response({"error": "INVALID_KIND"}, status=status.HTTP_400_BAD_REQUEST)
        issue, role = _visible_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        is_team = role != ROLE.GUEST.value
        # O cliente só gera o link de envio; o de entrega é da equipe.
        if not is_team and kind != IssueAcervoLink.Kind.UPLOAD:
            return Response({"error": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)
        if not acervo.is_enabled():
            return Response(DISABLED, status=status.HTTP_400_BAD_REQUEST)
        try:
            link, created = acervo.create_link(issue, kind, acervo.get_client())
        except NextcloudError as e:
            return _unavailable(e)
        return Response(
            acervo.link_data(link, acervo.today_for(issue.project), include_folder=is_team),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class IssueAcervoLinkDetailEndpoint(BaseAPIView):
    def _link(self, slug, project_id, issue_id, pk):
        return (
            IssueAcervoLink.objects.filter(
                workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=pk, revoked_at__isnull=True
            )
            .select_related("issue", "project", "project__workspace")
            .first()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, issue_id, pk):
        """``renew: true`` (mais ``NEXTCLOUD_LINK_DAYS`` dias a partir de hoje) ou ``expires_on`` (AAAA-MM-DD)."""
        link = self._link(slug, project_id, issue_id, pk)
        if link is None:
            return Response({"error": "Link not found"}, status=status.HTTP_404_NOT_FOUND)
        if not acervo.is_enabled():
            return Response(DISABLED, status=status.HTTP_400_BAD_REQUEST)
        today = acervo.today_for(link.project)
        if request.data.get("renew"):
            expires_on = today + timedelta(days=settings.NEXTCLOUD_LINK_DAYS)
        else:
            expires_on = acervo.parse_expiry(request.data.get("expires_on"), today)
            if expires_on is None:
                return Response({"error": "INVALID_DATE"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            acervo.change_link_expiry(link, expires_on, acervo.get_client())
        except NextcloudError as e:
            return _unavailable(e)
        return Response(acervo.link_data(link, today, include_folder=True), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, issue_id, pk):
        link = self._link(slug, project_id, issue_id, pk)
        if link is None:
            return Response({"error": "Link not found"}, status=status.HTTP_404_NOT_FOUND)
        if not acervo.is_enabled():
            return Response(DISABLED, status=status.HTTP_400_BAD_REQUEST)
        try:
            acervo.revoke_link(link, acervo.get_client())
        except NextcloudError as e:
            return _unavailable(e)
        return Response(status=status.HTTP_204_NO_CONTENT)
