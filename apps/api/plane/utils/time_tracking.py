# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: regras do tempo gasto por peça (``IssueTimeEntry``), usadas pela API, pelos extras dos cards e
pela tarefa que para cronômetro esquecido."""

# Python imports
from datetime import timedelta

# Django imports
from django.db.models import Q, Sum
from django.utils import timezone

# Module imports
from plane.db.models import IssueTimeEntry

# Cronômetro que passa disso foi esquecido: para sozinho nesse limite, marcado como "parado sozinho".
AUTO_STOP_SECONDS = 12 * 3600


def entry_seconds(entry, now=None):
    """Segundos de um lançamento; o que está rodando conta até agora (no máximo o limite)."""
    if entry.ended_at is not None:
        return entry.duration_seconds
    now = now or timezone.now()
    return max(0, min(int((now - entry.started_at).total_seconds()), AUTO_STOP_SECONDS))


def total_seconds(entries, now=None):
    now = now or timezone.now()
    return sum(entry_seconds(entry, now) for entry in entries)


def totals_by_issue(project_filter, now=None):
    """``{issue_id: segundos}`` dos itens que têm tempo, para os extras dos cards."""
    now = now or timezone.now()
    totals = {}
    finished = (
        IssueTimeEntry.objects.filter(project_filter, ended_at__isnull=False)
        .values("issue_id")
        .annotate(total=Sum("duration_seconds"))
    )
    for row in finished:
        totals[row["issue_id"]] = row["total"] or 0
    for issue_id, started_at in IssueTimeEntry.objects.filter(project_filter, ended_at__isnull=True).values_list(
        "issue_id", "started_at"
    ):
        running = max(0, min(int((now - started_at).total_seconds()), AUTO_STOP_SECONDS))
        totals[issue_id] = totals.get(issue_id, 0) + running
    return totals


def stop_running_entry(user, now=None):
    """Para o cronômetro da pessoa, se houver, e devolve o lançamento parado. Chamar dentro de transação."""
    entry = IssueTimeEntry.objects.select_for_update().filter(user=user, ended_at__isnull=True).first()
    if not entry:
        return None
    now = now or timezone.now()
    seconds = int((now - entry.started_at).total_seconds())
    if seconds > AUTO_STOP_SECONDS:
        seconds = AUTO_STOP_SECONDS
        entry.source = IssueTimeEntry.Source.AUTO_STOPPED
    entry.duration_seconds = max(0, seconds)
    entry.ended_at = entry.started_at + timedelta(seconds=entry.duration_seconds)
    entry.save(update_fields=["duration_seconds", "ended_at", "source", "updated_at"])
    return entry


def stop_forgotten_entries(now=None):
    """Para os cronômetros que passaram do limite. Devolve quantos parou."""
    now = now or timezone.now()
    limit = now - timedelta(seconds=AUTO_STOP_SECONDS)
    stopped = 0
    for entry in IssueTimeEntry.objects.filter(Q(ended_at__isnull=True) & Q(started_at__lte=limit)):
        entry.duration_seconds = AUTO_STOP_SECONDS
        entry.ended_at = entry.started_at + timedelta(seconds=AUTO_STOP_SECONDS)
        entry.source = IssueTimeEntry.Source.AUTO_STOPPED
        entry.save(update_fields=["duration_seconds", "ended_at", "source", "updated_at"])
        stopped += 1
    return stopped
