# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: o que os cards da lista e do quadro mostram além dos campos do item (progresso das
subtarefas, capa, repetição, tempo gasto), numa requisição por projeto; e a capa do item."""

# Django imports
from django.db.models import Count, Q

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import FileAsset, Issue, IssueChecklistItem, IssueRecurrence, Project, ProjectMember
from plane.utils.issue_cover import COVER_FLAG, cover_url, is_image_attachment, set_issue_cover
from plane.utils.time_tracking import totals_by_issue


class ProjectCardExtrasEndpoint(BaseAPIView):
    """``{issue_id: {"checklist": {"done", "total"}, "cover": url, "recurring": true, "time": segundos}}``, só com os
    itens que têm alguma coisa. Itens apagados e arquivados ficam de fora. O tempo só vai para o cliente
    (convidado) quando o projeto mostra o tempo aos clientes."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        live = {"issue__deleted_at__isnull": True, "issue__archived_at__isnull": True}
        extras = {}
        progress = (
            IssueChecklistItem.objects.filter(workspace__slug=slug, project_id=project_id, **live)
            .values("issue_id")
            .annotate(total=Count("id"), done=Count("id", filter=Q(is_completed=True)))
        )
        for row in progress:
            extras.setdefault(str(row["issue_id"]), {})["checklist"] = {"done": row["done"], "total": row["total"]}
        covers = FileAsset.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
            is_uploaded=True,
            **{f"attributes__{COVER_FLAG}": True},
            **live,
        ).values_list("issue_id", "id")
        for issue_id, asset_id in covers:
            extras.setdefault(str(issue_id), {})["cover"] = cover_url(slug, project_id, issue_id, asset_id)
        recurring = IssueRecurrence.objects.filter(
            workspace__slug=slug, project_id=project_id, next_date__isnull=False, **live
        ).values_list("issue_id", flat=True)
        for issue_id in recurring:
            extras.setdefault(str(issue_id), {})["recurring"] = True
        is_guest = (
            ProjectMember.objects.filter(project_id=project_id, member=request.user, is_active=True)
            .values_list("role", flat=True)
            .first()
            == ROLE.GUEST.value
        )
        if not is_guest or Project.objects.filter(pk=project_id, time_tracking_client_visible=True).exists():
            times = totals_by_issue(Q(workspace__slug=slug, project_id=project_id, **live))
            for issue_id, seconds in times.items():
                if seconds:
                    extras.setdefault(str(issue_id), {})["time"] = seconds
        return Response(extras, status=status.HTTP_200_OK)


class IssueCoverEndpoint(BaseAPIView):
    """Põe um anexo de imagem do item como capa (``attachment_id``) ou tira a capa (``null``)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        attachment_id = request.data.get("attachment_id")
        asset = None
        if attachment_id:
            asset = FileAsset.objects.filter(
                pk=attachment_id,
                issue_id=issue.id,
                entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                is_uploaded=True,
            ).first()
            if not asset or not is_image_attachment(asset):
                return Response(
                    {"error": "Cover must be an image attachment of this work item", "code": "INVALID_COVER"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        set_issue_cover(issue.id, asset)
        return Response(
            {
                "cover": cover_url(slug, project_id, issue.id, asset.id) if asset else None,
                "attachment_id": attachment_id,
            },
            status=status.HTTP_200_OK,
        )


__all__ = ["ProjectCardExtrasEndpoint", "IssueCoverEndpoint"]
