# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: relatório de horas do espaço de trabalho (tempo gasto por peça).

``GET …/time-report/?start=AAAA-MM-DD&end=AAAA-MM-DD&project=<id>&user=<id>`` devolve os totais por pessoa,
por projeto (cada cliente é um projeto) e por item. ``…/time-report/export/`` devolve os lançamentos em CSV
(separado por ponto e vírgula, com BOM, para o Excel em português abrir direto).

Quem é admin do espaço de trabalho vê as horas de todos; os outros membros veem só as próprias. O dia de um
lançamento é o dia em que ele começou, no fuso do espaço de trabalho."""

# Python imports
import csv
import io
import uuid
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# Django imports
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import IssueTimeEntry, Workspace, WorkspaceMember
from plane.utils.time_tracking import entry_seconds

MAX_DAYS = 366
SOURCE_LABELS = {"timer": "Cronômetro", "manual": "Manual", "auto_stopped": "Parou sozinho"}


def _uuid_param(request, name):
    """Um filtro opcional por id; ``False`` quando veio inválido."""
    value = request.GET.get(name)
    if not value:
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError:
        return False


def _cell(value):
    # Texto começando com = + - @ vira fórmula no Excel/Sheets: entra como texto.
    text = str(value or "")
    return f"'{text}" if text[:1] in ("=", "+", "-", "@") else text


def _workspace_zone(workspace):
    try:
        return ZoneInfo(workspace.timezone or "America/Sao_Paulo")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("America/Sao_Paulo")


def _report_query(request, slug):
    """Os lançamentos do período, já com o filtro de quem pode ver o quê. Devolve (query, contexto) ou (None, erro)."""
    workspace = Workspace.objects.filter(slug=slug).first()
    if not workspace:
        return None, Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
    zone = _workspace_zone(workspace)
    today = timezone.now().astimezone(zone).date()
    start = parse_date(request.GET.get("start") or "") or today.replace(day=1)
    end = parse_date(request.GET.get("end") or "") or today
    if end < start:
        return None, Response({"error": "INVALID_PERIOD"}, status=status.HTTP_400_BAD_REQUEST)
    if (end - start).days >= MAX_DAYS:
        return None, Response({"error": "PERIOD_TOO_LONG"}, status=status.HTTP_400_BAD_REQUEST)

    user_id, project_id = _uuid_param(request, "user"), _uuid_param(request, "project")
    if user_id is False or project_id is False:
        return None, Response({"error": "INVALID_FILTER"}, status=status.HTTP_400_BAD_REQUEST)
    is_admin = WorkspaceMember.objects.filter(
        workspace=workspace, member=request.user, is_active=True, role=ROLE.ADMIN.value
    ).exists()
    query = IssueTimeEntry.objects.filter(
        workspace=workspace,
        started_at__gte=datetime.combine(start, time.min, tzinfo=zone),
        started_at__lt=datetime.combine(end + timedelta(days=1), time.min, tzinfo=zone),
    )
    if not is_admin:
        query = query.filter(user=request.user)
    elif user_id:
        query = query.filter(user_id=user_id)
    if project_id:
        query = query.filter(project_id=project_id)
    query = query.select_related("user", "project", "issue").order_by("started_at")
    return query, {"workspace": workspace, "zone": zone, "start": start, "end": end, "is_admin": is_admin}


def _person(user):
    return {
        "id": str(user.id),
        "display_name": user.display_name,
        "full_name": f"{user.first_name} {user.last_name}".strip(),
        "avatar_url": user.avatar_url,
    }


class WorkspaceTimeReportEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        query, context = _report_query(request, slug)
        if query is None:
            return context
        now = timezone.now()
        zone = context["zone"]
        by_user, by_project, by_issue, by_day = {}, {}, {}, {}
        total = 0
        for entry in query:
            seconds = entry_seconds(entry, now)
            total += seconds
            user_row = by_user.setdefault(entry.user_id, {**_person(entry.user), "seconds": 0})
            user_row["seconds"] += seconds
            project_row = by_project.setdefault(
                entry.project_id,
                {
                    "id": str(entry.project_id),
                    "name": entry.project.name,
                    "identifier": entry.project.identifier,
                    "seconds": 0,
                },
            )
            project_row["seconds"] += seconds
            issue_row = by_issue.setdefault(
                entry.issue_id,
                {
                    "id": str(entry.issue_id),
                    "name": entry.issue.name,
                    "sequence_id": entry.issue.sequence_id,
                    "project_id": str(entry.project_id),
                    "project_identifier": entry.project.identifier,
                    "seconds": 0,
                    "users": set(),
                },
            )
            issue_row["seconds"] += seconds
            issue_row["users"].add(str(entry.user_id))
            day = entry.started_at.astimezone(zone).date().isoformat()
            by_day[day] = by_day.get(day, 0) + seconds

        def ranked(rows):
            return sorted(rows, key=lambda row: row["seconds"], reverse=True)

        issues = ranked(by_issue.values())
        for row in issues:
            row["users"] = sorted(row["users"])
        return Response(
            {
                "start": context["start"].isoformat(),
                "end": context["end"].isoformat(),
                "is_admin": context["is_admin"],
                "total_seconds": total,
                "by_user": ranked(by_user.values()),
                "by_project": ranked(by_project.values()),
                "by_issue": issues,
                "by_day": [{"date": day, "seconds": seconds} for day, seconds in sorted(by_day.items())],
            },
            status=status.HTTP_200_OK,
        )


class WorkspaceTimeReportExportEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        query, context = _report_query(request, slug)
        if query is None:
            return context
        now = timezone.now()
        zone = context["zone"]
        buffer = io.StringIO()
        buffer.write("﻿")
        writer = csv.writer(buffer, delimiter=";")
        writer.writerow(
            [
                "Data",
                "Pessoa",
                "E-mail",
                "Projeto",
                "Item",
                "Título do item",
                "Início",
                "Fim",
                "Duração",
                "Horas",
                "Origem",
                "Observação",
            ]
        )
        for entry in query:
            seconds = entry_seconds(entry, now)
            started = entry.started_at.astimezone(zone)
            ended = entry.ended_at.astimezone(zone) if entry.ended_at else None
            writer.writerow(
                [
                    started.strftime("%d/%m/%Y"),
                    _cell(entry.user.display_name),
                    entry.user.email,
                    _cell(entry.project.name),
                    f"{entry.project.identifier}-{entry.issue.sequence_id}",
                    _cell(entry.issue.name),
                    started.strftime("%H:%M"),
                    ended.strftime("%H:%M") if ended else "rodando",
                    f"{seconds // 3600}:{(seconds % 3600) // 60:02d}",
                    f"{seconds / 3600:.2f}".replace(".", ","),
                    SOURCE_LABELS.get(entry.source, entry.source),
                    _cell(entry.note),
                ]
            )
        filename = (
            f"horas-{context['workspace'].slug}-{context['start'].isoformat()}-a-{context['end'].isoformat()}.csv"
        )
        response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
