# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import datetime, time, timedelta

# Django imports
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Issue, IssueTimeEntry, Project, ProjectMember
from plane.utils.time_tracking import entry_seconds, stop_running_entry, total_seconds

# Pespo: tempo gasto por peça. A equipe (admin e membro) lança e vê tudo; o cliente (convidado) vê só o
# total, quando o projeto liga time_tracking_client_visible.

MAX_ENTRY_SECONDS = 24 * 3600
MAX_NOTE = 500


def _role(user, project_id):
    return (
        ProjectMember.objects.filter(project_id=project_id, member=user, is_active=True)
        .values_list("role", flat=True)
        .first()
    )


def _issue(slug, project_id, issue_id):
    return Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()


def entry_data(entry, now=None):
    user = entry.user
    return {
        "id": str(entry.id),
        "issue": str(entry.issue_id),
        "project": str(entry.project_id),
        "user": str(entry.user_id),
        "user_display_name": user.display_name if user else "",
        "started_at": entry.started_at,
        "ended_at": entry.ended_at,
        "duration_seconds": entry_seconds(entry, now),
        "note": entry.note,
        "source": entry.source,
        "is_running": entry.ended_at is None,
    }


def _parse_duration(value):
    try:
        seconds = int(value)
    except (TypeError, ValueError):
        return None
    return seconds if 60 <= seconds <= MAX_ENTRY_SECONDS else None


def _parse_start(value, duration):
    """``started_at`` (data e hora) ou ``date`` (só o dia: começa às 9h no fuso do servidor). Sem nada,
    o lançamento termina agora."""
    if not value:
        return timezone.now() - timedelta(seconds=duration)
    moment = parse_datetime(str(value))
    if moment is None:
        day = parse_date(str(value))
        if day is None:
            return None
        moment = datetime.combine(day, time(9, 0))
    if timezone.is_naive(moment):
        moment = timezone.make_aware(moment)
    return moment


class IssueTimeEntryEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = _issue(slug, project_id, issue_id)
        if not issue:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        now = timezone.now()
        entries = list(IssueTimeEntry.objects.filter(issue=issue).select_related("user"))
        total = total_seconds(entries, now)
        if _role(request.user, project_id) == ROLE.GUEST.value:
            project = Project.objects.get(pk=project_id)
            if not project.time_tracking_client_visible:
                return Response({"error": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)
            # o cliente vê o total da peça, sem quem trabalhou nem os lançamentos
            return Response({"total_seconds": total, "now": now, "entries": None}, status=status.HTTP_200_OK)
        return Response(
            {"total_seconds": total, "now": now, "entries": [entry_data(entry, now) for entry in entries]},
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        """Lançamento manual: ``duration_seconds`` (1 min a 24 h), ``started_at`` ou ``date`` e ``note``."""
        issue = _issue(slug, project_id, issue_id)
        if not issue:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        duration = _parse_duration(request.data.get("duration_seconds"))
        if duration is None:
            return Response({"error": "Invalid duration"}, status=status.HTTP_400_BAD_REQUEST)
        started_at = _parse_start(request.data.get("started_at") or request.data.get("date"), duration)
        if started_at is None:
            return Response({"error": "Invalid date"}, status=status.HTTP_400_BAD_REQUEST)
        note = (request.data.get("note") or "").strip()[:MAX_NOTE]
        entry = IssueTimeEntry.objects.create(
            issue=issue,
            project_id=project_id,
            user=request.user,
            started_at=started_at,
            ended_at=started_at + timedelta(seconds=duration),
            duration_seconds=duration,
            note=note,
            source=IssueTimeEntry.Source.MANUAL,
        )
        return Response(entry_data(entry), status=status.HTTP_201_CREATED)


class IssueTimeEntryDetailEndpoint(BaseAPIView):
    def _entry(self, slug, project_id, issue_id, pk):
        return (
            IssueTimeEntry.objects.filter(
                workspace__slug=slug, project_id=project_id, issue_id=issue_id, issue__project_id=project_id, pk=pk
            )
            .select_related("user")
            .first()
        )

    def _can_change(self, request, entry, project_id):
        return entry.user_id == request.user.id or _role(request.user, project_id) == ROLE.ADMIN.value

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, issue_id, pk):
        entry = self._entry(slug, project_id, issue_id, pk)
        if not entry:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        if not self._can_change(request, entry, project_id):
            return Response({"error": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)
        data = request.data
        if "note" in data:
            entry.note = (data.get("note") or "").strip()[:MAX_NOTE]
        if entry.ended_at is not None and ("duration_seconds" in data or "started_at" in data or "date" in data):
            duration = entry.duration_seconds
            if "duration_seconds" in data:
                duration = _parse_duration(data.get("duration_seconds"))
                if duration is None:
                    return Response({"error": "Invalid duration"}, status=status.HTTP_400_BAD_REQUEST)
            if "started_at" in data or "date" in data:
                started_at = _parse_start(data.get("started_at") or data.get("date"), duration)
                if started_at is None:
                    return Response({"error": "Invalid date"}, status=status.HTTP_400_BAD_REQUEST)
                entry.started_at = started_at
            entry.duration_seconds = duration
            entry.ended_at = entry.started_at + timedelta(seconds=duration)
        entry.save()
        return Response(entry_data(entry), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, issue_id, pk):
        entry = self._entry(slug, project_id, issue_id, pk)
        if not entry:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        if not self._can_change(request, entry, project_id):
            return Response({"error": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)
        entry.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueTimeEntryStartEndpoint(BaseAPIView):
    """Começa o cronômetro de quem chama neste item.

    Com outro cronômetro rodando (em outro item), responde 409 ``TIMER_ALREADY_RUNNING`` com ele, para a tela
    perguntar antes; ``{"replace": true}`` para o outro e começa este. No mesmo item, devolve o que já roda."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()
        if not issue:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        note = (request.data.get("note") or "").strip()[:MAX_NOTE]
        replace = request.data.get("replace") is True
        try:
            with transaction.atomic():
                current = (
                    IssueTimeEntry.objects.select_for_update()
                    .filter(user=request.user, ended_at__isnull=True)
                    .select_related("issue", "issue__project", "issue__workspace", "user")
                    .first()
                )
                if current and current.issue_id == issue.id:
                    data = running_data(current)
                    data["stopped"] = None
                    return Response(data, status=status.HTTP_200_OK)
                if current and not replace:
                    return _already_running(current)
                stopped = stop_running_entry(request.user) if current else None
                entry = IssueTimeEntry.objects.create(
                    issue=issue,
                    project_id=project_id,
                    user=request.user,
                    started_at=timezone.now(),
                    note=note,
                    source=IssueTimeEntry.Source.TIMER,
                )
        except IntegrityError:
            # dois cliques ao mesmo tempo: o outro já começou
            current = (
                IssueTimeEntry.objects.filter(user=request.user, ended_at__isnull=True)
                .select_related("issue", "issue__project", "issue__workspace", "user")
                .first()
            )
            if current:
                return _already_running(current)
            return Response({"error": "A timer is already running"}, status=status.HTTP_409_CONFLICT)
        data = running_data(entry)
        data["stopped"] = entry_data(stopped) if stopped else None
        return Response(data, status=status.HTTP_201_CREATED)


def _already_running(entry):
    return Response(
        {"error": "TIMER_ALREADY_RUNNING", "running": running_data(entry)},
        status=status.HTTP_409_CONFLICT,
    )


def running_data(entry):
    data = entry_data(entry)
    issue = entry.issue
    data.update(
        {
            "issue_name": issue.name,
            "issue_sequence_id": issue.sequence_id,
            "project_identifier": issue.project.identifier,
            "workspace_slug": issue.workspace.slug,
            "now": timezone.now(),
        }
    )
    return data


class WorkspaceRunningTimeEntryEndpoint(BaseAPIView):
    """O cronômetro de quem chama (para o indicador no topo do Hub): GET mostra, POST para."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        entry = (
            IssueTimeEntry.objects.filter(user=request.user, ended_at__isnull=True)
            .select_related("issue", "issue__project", "issue__workspace", "user")
            .first()
        )
        if not entry:
            return Response({"running": None}, status=status.HTTP_200_OK)
        return Response({"running": running_data(entry)}, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        with transaction.atomic():
            stopped = stop_running_entry(request.user)
        return Response({"stopped": entry_data(stopped) if stopped else None}, status=status.HTTP_200_OK)
