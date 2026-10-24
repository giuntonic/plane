# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models

# Module imports
from .project import ProjectBaseModel


class IssueRecurrence(ProjectBaseModel):
    """Pespo: item de trabalho que se repete (estilo ClickUp). O item com a regra é o "original": a cada
    ocorrência, uma task do Celery beat cria uma cópia dele (com subtarefas, checklists, links e sub-itens)
    com prazo na data da ocorrência. As contas das datas estão em ``plane.utils.recurrence``.
    Apagar a regra é definitivo (sem soft delete)."""

    FREQUENCY_CHOICES = (("daily", "Daily"), ("weekly", "Weekly"), ("monthly", "Monthly"), ("yearly", "Yearly"))

    issue = models.OneToOneField("db.Issue", on_delete=models.CASCADE, related_name="pespo_recurrence")
    frequency = models.CharField(max_length=10, choices=FREQUENCY_CHOICES)
    interval = models.PositiveSmallIntegerField(default=1)
    # Dias da semana (0 = segunda … 6 = domingo), só na semanal.
    weekdays = models.JSONField(default=list, blank=True)
    # Primeira ocorrência da série (o prazo do original quando a regra foi salva).
    anchor_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    # Próxima cópia a criar; vazio = a série acabou.
    next_date = models.DateField(null=True, blank=True)
    last_created_issue = models.ForeignKey(
        "db.Issue", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_count = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Issue Recurrence"
        verbose_name_plural = "Issue Recurrences"
        db_table = "issue_recurrences"
        indexes = [models.Index(fields=["next_date"], name="issue_recurrence_next_idx")]

    def __str__(self):
        return f"{self.issue_id} -> {self.frequency}/{self.interval}"

    @property
    def rule(self):
        return {
            "frequency": self.frequency,
            "interval": self.interval,
            "weekdays": self.weekdays or [],
            "anchor_date": self.anchor_date,
            "end_date": self.end_date,
        }
