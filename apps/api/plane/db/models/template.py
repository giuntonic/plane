# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models

# Module imports
from .base import BaseModel


class EntityTemplate(BaseModel):
    """Pespo: modelo de item de trabalho, módulo, ciclo, página ou projeto.

    ``data`` é uma fotografia feita pelo servidor a partir de uma entidade existente (ver
    ``plane.utils.work_item_tree`` e ``plane.app.views.workspace.template``); quem usa o modelo
    recebe uma entidade nova com a mesma estrutura. ``project`` vazio = disponível em todos os
    projetos do workspace (modelos de projeto são sempre do workspace)."""

    class Kind(models.TextChoices):
        WORK_ITEM = "work_item", "Work item"
        MODULE = "module", "Module"
        CYCLE = "cycle", "Cycle"
        PAGE = "page", "Page"
        PROJECT = "project", "Project"

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="entity_templates")
    project = models.ForeignKey(
        "db.Project", on_delete=models.CASCADE, null=True, blank=True, related_name="entity_templates"
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    data = models.JSONField(default=dict)

    class Meta:
        verbose_name = "Entity Template"
        verbose_name_plural = "Entity Templates"
        db_table = "entity_templates"
        ordering = ("name", "created_at")
        indexes = [models.Index(fields=["workspace", "kind"], name="entity_template_ws_kind_idx")]

    def __str__(self):
        return f"{self.kind}: {self.name}"
