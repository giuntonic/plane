# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: funções e serviços da equipe (antes ``funcoes``, ``servicos``, ``funcao_servicos`` e
``funcionario_funcoes`` do painel admin; decisão de 02/11/2026 de trazer para o Hub).

Um serviço é um app da Pespo (nome, endereço, ícone). Cada função diz quais serviços ela vê e quem da equipe a tem
(uma pessoa pode ter mais de uma; vê a união). O atalho "Serviços", no topo do Hub, mostra os serviços da pessoa;
admins do espaço de trabalho veem todos."""

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .base import BaseModel


class TeamService(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="pespo_team_services")
    name = models.CharField(max_length=255)
    url = models.URLField(max_length=500)
    icon = models.CharField(max_length=16, default="🔧", blank=True)
    description = models.CharField(max_length=500, blank=True, default="")
    sort_order = models.IntegerField(default=0)

    class Meta:
        verbose_name = "Team Service"
        verbose_name_plural = "Team Services"
        db_table = "pespo_team_services"
        ordering = ("sort_order", "name")

    def __str__(self):
        return self.name


class TeamRole(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="pespo_team_roles")
    name = models.CharField(max_length=255)
    description = models.CharField(max_length=500, blank=True, default="")
    services = models.ManyToManyField(TeamService, related_name="roles", blank=True)
    members = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="pespo_team_roles", blank=True)

    class Meta:
        verbose_name = "Team Role"
        verbose_name_plural = "Team Roles"
        db_table = "pespo_team_roles"
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="pespo_team_role_unique_name",
            )
        ]

    def __str__(self):
        return self.name
