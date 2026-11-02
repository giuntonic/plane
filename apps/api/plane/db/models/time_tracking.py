# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel


class IssueTimeEntry(ProjectBaseModel):
    """Pespo: tempo gasto numa peça (item de trabalho), por pessoa.

    Vem do cronômetro (``source="timer"``: começa sem ``ended_at`` e para depois) ou é lançado à mão
    (``source="manual"``). Cada pessoa tem no máximo um cronômetro rodando, em qualquer item: começar outro
    para o anterior. ``duration_seconds`` só vale com ``ended_at``; enquanto roda, o tempo é ``agora -
    started_at``. Cronômetro esquecido para sozinho (``plane/bgtasks/time_tracking_task.py``).

    A equipe vê tudo; o cliente (convidado) vê só o total da peça, e só quando o projeto liga
    ``Project.time_tracking_client_visible``. Sem soft delete: apagar tira de verdade."""

    class Source(models.TextChoices):
        TIMER = "timer"
        MANUAL = "manual"
        AUTO_STOPPED = "auto_stopped"

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="time_entries")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="time_entries")
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    note = models.TextField(blank=True, default="")
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.TIMER)

    class Meta:
        verbose_name = "Issue Time Entry"
        verbose_name_plural = "Issue Time Entries"
        db_table = "issue_time_entries"
        ordering = ("-started_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["user"],
                condition=Q(ended_at__isnull=True, deleted_at__isnull=True),
                name="one_running_time_entry_per_user",
            )
        ]
        indexes = [models.Index(fields=["project", "issue"], name="time_entry_project_issue_idx")]

    def __str__(self):
        return f"{self.issue_id} -> {self.user_id} ({self.duration_seconds}s)"
