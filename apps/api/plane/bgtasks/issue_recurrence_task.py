# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: cria as cópias dos itens recorrentes que vencem hoje (beat de hora em hora; ver
``plane.utils.issue_recurrence``)."""

# Python imports
import logging

# Third party imports
from celery import shared_task

# Module imports
from plane.db.models import IssueRecurrence
from plane.utils.issue_recurrence import create_due_occurrences, today_sp

logger = logging.getLogger("plane.worker")


@shared_task
def create_recurring_issues():
    today = today_sp()
    due = IssueRecurrence.objects.filter(
        next_date__lte=today, issue__deleted_at__isnull=True, issue__archived_at__isnull=True
    ).values_list("id", flat=True)
    total = 0
    for recurrence_id in list(due):
        try:
            total += create_due_occurrences(recurrence_id, today)
        except Exception:  # noqa: BLE001 - uma regra quebrada não pode parar as outras
            logger.exception("Falha ao criar a ocorrência da recorrência %s", recurrence_id)
    return total
