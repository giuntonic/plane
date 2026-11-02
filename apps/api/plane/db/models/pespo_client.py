# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: clientes e contratos dentro do Hub (antes só no banco do portal, criados pelo painel admin).

Primeiro passo da mudança (estudo em ``pespo-infra/docs/estudo-clientes-contratos-aprovacao-no-hub.md``): os
dados chegam pelo comando ``import_portal_clients``, que lê o banco do portal e pode rodar quantas vezes for
preciso. Quem lê o contrato (painel de peças, pedido de peças, relatório do mês) continua indo ao portal até
``PESPO_CONTRACTS_SOURCE=hub`` (``plane.utils.portal_contracts``)."""

# Django imports
from django.db import models

# Module imports
from .base import BaseModel


class PespoClient(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="pespo_clients")
    name = models.CharField(max_length=255)
    # Um cliente = um projeto hoje; o modelo aceita mais de um
    projects = models.ManyToManyField("db.Project", related_name="pespo_clients", blank=True)
    # ``clientes.cliente_id`` no portal (texto, ex.: "acme"), para a importação achar o mesmo cliente de novo
    portal_client_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Pespo Client"
        verbose_name_plural = "Pespo Clients"
        db_table = "pespo_clients"
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "portal_client_id"],
                condition=models.Q(portal_client_id__isnull=False, deleted_at__isnull=True),
                name="pespo_client_unique_portal_id",
            )
        ]

    def __str__(self):
        return self.name


class PespoContract(BaseModel):
    class Type(models.TextChoices):
        FEE = "FEE", "FEE"
        FEP = "FEP", "FEP"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        RENEWED = "renewed", "Renewed"
        EXPIRED = "expired", "Expired"

    # os valores do portal (``contratos.status``)
    PORTAL_STATUS = {"ativo": Status.ACTIVE, "renovado": Status.RENEWED, "vencido": Status.EXPIRED}

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="pespo_contracts")
    client = models.ForeignKey(PespoClient, on_delete=models.CASCADE, related_name="contracts")
    contract_type = models.CharField(max_length=8, choices=Type.choices, default=Type.FEE)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    urgent_limit = models.PositiveIntegerField(default=0)
    # quando o aviso de vencimento foi criado no projeto (``contratos.aviso_vencimento_enviado_em`` no portal)
    expiry_notice_sent_at = models.DateTimeField(null=True, blank=True)
    # ``contratos.id`` no portal
    portal_contract_id = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        verbose_name = "Pespo Contract"
        verbose_name_plural = "Pespo Contracts"
        db_table = "pespo_contracts"
        ordering = ("-start_date",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "portal_contract_id"],
                condition=models.Q(portal_contract_id__isnull=False, deleted_at__isnull=True),
                name="pespo_contract_unique_portal_id",
            )
        ]
        indexes = [models.Index(fields=["status", "end_date"], name="pespo_contract_status_end_idx")]

    def __str__(self):
        return f"{self.client_id} {self.contract_type} {self.start_date}–{self.end_date}"


class PespoContractCategory(BaseModel):
    contract = models.ForeignKey(PespoContract, on_delete=models.CASCADE, related_name="categories")
    # Post, Reels, Artigo, Anuncio (``plane.utils.pieces.CATEGORIES``)
    category = models.CharField(max_length=64)
    contracted = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Pespo Contract Category"
        verbose_name_plural = "Pespo Contract Categories"
        db_table = "pespo_contract_categories"
        ordering = ("category",)
        constraints = [
            models.UniqueConstraint(
                fields=["contract", "category"],
                condition=models.Q(deleted_at__isnull=True),
                name="pespo_contract_category_unique",
            )
        ]

    def __str__(self):
        return f"{self.category}: {self.contracted}"


class PespoClientLogin(BaseModel):
    """Um e-mail do cliente com acesso ao Hub (antes ``clientes_login`` do portal). O acesso é de convidado
    (papel 5) nos projetos do cliente; quem ainda não tem conta recebe um convite e entra no projeto no primeiro
    login (``plane.utils.pespo_clients.attach_client_logins``)."""

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="pespo_client_logins")
    client = models.ForeignKey(PespoClient, on_delete=models.CASCADE, related_name="logins")
    email = models.CharField(max_length=255)

    class Meta:
        verbose_name = "Pespo Client Login"
        verbose_name_plural = "Pespo Client Logins"
        db_table = "pespo_client_logins"
        ordering = ("email",)
        constraints = [
            models.UniqueConstraint(
                fields=["client", "email"],
                condition=models.Q(deleted_at__isnull=True),
                name="pespo_client_login_unique",
            )
        ]

    def __str__(self):
        return self.email
