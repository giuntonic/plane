# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .project import ProjectBaseModel


class IssueChecklist(ProjectBaseModel):
    """Pespo: checklist com nome dentro de um item de trabalho ("Aprovação", "Entrega"…), estilo Trello.
    As linhas sem ``checklist`` formam a lista padrão, "Subtarefas", que não tem registro aqui.
    Apagar a checklist apaga as linhas dela (sem soft delete, como as linhas)."""

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="checklists")
    name = models.CharField(max_length=255)
    sort_order = models.FloatField(default=65535)

    class Meta:
        verbose_name = "Issue Checklist"
        verbose_name_plural = "Issue Checklists"
        db_table = "issue_checklists"
        ordering = ("sort_order", "created_at")

    def __str__(self):
        return f"{self.issue_id} -> {self.name[:50]}"


class IssueChecklistItem(ProjectBaseModel):
    """Pespo: subtarefa leve dentro de um item de trabalho (estilo Trello/ClickUp/Notion).
    Não é um item de trabalho: não aparece nas visualizações nem tem estado próprio.
    As linhas formam uma árvore (``parent``), então qualquer linha pode virar uma
    sublista. A ordem entre irmãos vem de ``sort_order``.

    Linhas apagadas saem de verdade (sem soft delete): o ``CASCADE`` do ``parent``
    leva junto as sublistas. ``checklist`` separa as linhas em listas com nome."""

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="checklist_items")
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, blank=True, related_name="children")
    # Checklist com nome a que a linha pertence (vazio = "Subtarefas"). As sublinhas ficam sempre na
    # mesma checklist da linha de cima.
    checklist = models.ForeignKey(IssueChecklist, on_delete=models.CASCADE, null=True, blank=True, related_name="items")
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
