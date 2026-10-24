# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Pespo: itens recorrentes. A regra fica no item "original" (``IssueRecurrence``); em cada data da série,
``create_due_occurrences`` cria uma cópia dele com a mesma estrutura da cópia comum
(``plane.utils.work_item_tree``): subtarefas desmarcadas, checklists, links e sub-itens, no estado padrão.

- O prazo da cópia é a data da ocorrência; o início anda junto (mesma distância do original).
- A cópia entra nos mesmos módulos do original; ciclo não (ciclo é uma janela de tempo).
- Quem cria é quem salvou a regra; se a pessoa saiu do projeto, a série para.
- Se o worker ficou parado, cria no máximo ``MAX_CATCH_UP`` ocorrências atrasadas e pula para a próxima.
"""

# Python imports
import logging
from datetime import timedelta
from zoneinfo import ZoneInfo

# Third party imports
from crum import impersonate

# Django imports
from django.db import transaction
from django.utils import timezone

# Module imports
from plane.db.models import Issue, IssueRecurrence, ModuleIssue, ProjectMember
from plane.utils.recurrence import next_occurrence
from plane.utils.work_item_tree import (
    WorkItemTreeTooLarge,
    create_work_item,
    date_shifter,
    project_context,
    snapshot_work_item,
)

logger = logging.getLogger("plane.worker")

SAO_PAULO = ZoneInfo("America/Sao_Paulo")
MAX_CATCH_UP = 10


def today_sp():
    return timezone.now().astimezone(SAO_PAULO).date()


def first_next_date(rule, issue, today=None):
    """Próxima ocorrência ao salvar a regra: o original cobre a própria data; uma âncora no passado
    começa a série a partir de hoje."""
    today = today or today_sp()
    return next_occurrence(rule, max(rule["anchor_date"], today - timedelta(days=1)))


def serialize(recurrence):
    if not recurrence:
        return None
    return {
        "id": str(recurrence.id),
        "issue": str(recurrence.issue_id),
        "frequency": recurrence.frequency,
        "interval": recurrence.interval,
        "weekdays": recurrence.weekdays or [],
        "anchor_date": recurrence.anchor_date.isoformat(),
        "end_date": recurrence.end_date.isoformat() if recurrence.end_date else None,
        "next_date": recurrence.next_date.isoformat() if recurrence.next_date else None,
        "created_count": recurrence.created_count,
        "last_created_issue": str(recurrence.last_created_issue_id) if recurrence.last_created_issue_id else None,
    }


def _create_occurrence(recurrence, node, ctx, day, module_ids):
    source = recurrence.issue
    # O prazo do original vira a data da ocorrência; sem prazo, o início; sem datas, a âncora.
    base = source.target_date or source.start_date or recurrence.anchor_date
    shift = date_shifter(base, day, keep_unanchored_dates=False)
    issue = create_work_item(node, ctx, shift, module_ids=module_ids)
    if not issue.target_date and not issue.start_date:
        Issue.objects.filter(pk=issue.pk).update(target_date=day)
    return issue


def create_due_occurrences(recurrence_id, today=None):
    """Cria as cópias com data até hoje. Devolve quantas criou."""
    today = today or today_sp()
    with transaction.atomic():
        recurrence = (
            IssueRecurrence.objects.select_for_update(skip_locked=True, of=("self",))
            .filter(pk=recurrence_id, issue__deleted_at__isnull=True, issue__archived_at__isnull=True)
            .select_related("issue", "project", "project__workspace", "created_by")
            .first()
        )
        if not recurrence or not recurrence.next_date or recurrence.next_date > today:
            return 0
        actor = recurrence.created_by
        if (
            not actor
            or not ProjectMember.objects.filter(
                project_id=recurrence.project_id, member=actor, is_active=True, role__gte=15
            ).exists()
        ):
            logger.warning("Recorrência %s parada: quem criou a regra saiu do projeto", recurrence_id)
            recurrence.next_date = None
            recurrence.save(update_fields=["next_date", "updated_at"])
            return 0
        try:
            node = snapshot_work_item(recurrence.issue)
        except WorkItemTreeTooLarge:
            logger.warning("Recorrência %s parada: item grande demais para copiar", recurrence_id)
            recurrence.next_date = None
            recurrence.save(update_fields=["next_date", "updated_at"])
            return 0
        module_ids = [
            str(m) for m in ModuleIssue.objects.filter(issue=recurrence.issue).values_list("module_id", flat=True)
        ]
        ctx = project_context(recurrence.project, actor)
        created = 0
        with impersonate(actor):
            while recurrence.next_date and recurrence.next_date <= today and created < MAX_CATCH_UP:
                issue = _create_occurrence(recurrence, node, ctx, recurrence.next_date, module_ids)
                recurrence.last_created_issue = issue
                recurrence.created_count += 1
                created += 1
                recurrence.next_date = next_occurrence(recurrence.rule, recurrence.next_date)
        if recurrence.next_date and recurrence.next_date <= today:
            recurrence.next_date = next_occurrence(recurrence.rule, today)
        recurrence.save(update_fields=["next_date", "last_created_issue", "created_count", "updated_at"])
        return created


__all__ = ["create_due_occurrences", "first_next_date", "serialize", "today_sp"]
