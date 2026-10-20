# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .project import ProjectBaseModel


class IssueChecklistItem(ProjectBaseModel):
    """Pespo: subtarefa leve dentro de um item de trabalho (estilo Trello/ClickUp/Notion).
    Não é um item de trabalho: não aparece nas visualizações nem tem estado próprio.
    As linhas formam uma árvore (``parent``), então qualquer linha pode virar uma
    sublista. A ordem entre irmãos vem de ``sort_order``.

    Linhas apagadas saem de verdade (sem soft delete): o ``CASCADE`` do ``parent``
    leva junto as sublistas."""

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="checklist_items")
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, blank=True, related_name="children")
    name = models.TextField(blank=True, default="")
    is_completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_checklist_items",
    )
    due_date = models.DateField(null=True, blank=True)
    sort_order = models.FloatField(default=65535)

    class Meta:
        verbose_name = "Issue Checklist Item"
        verbose_name_plural = "Issue Checklist Items"
        db_table = "issue_checklist_items"
        ordering = ("sort_order", "created_at")

    def __str__(self):
        return f"{self.issue_id} -> {self.name[:50]}"
