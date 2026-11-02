# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: Acervo da peça no Nextcloud (arquivos.pespo.com.br).

Cada projeto tem uma pasta no Acervo (``Project.acervo_folder``) e cada peça que ganha um link tem uma subpasta
com ``Recebido/`` (o cliente manda o material bruto por um link "só envio") e ``Entrega/`` (a equipe põe o que
vai para o cliente, com um link de leitura). Os links são públicos do Nextcloud, com validade; o Hub guarda o id
para renovar e revogar. As regras ficam em ``plane/utils/acervo.py``."""

# Django imports
from django.conf import settings
from django.db import models, transaction
from django.db.models import Q
from django.db.models.signals import post_save
from django.dispatch import receiver

# Module imports
from .project import Project, ProjectBaseModel


class IssueAcervoFolder(ProjectBaseModel):
    """Pasta da peça no Acervo. ``path`` é relativo à raiz do usuário de serviço do Hub no Nextcloud.

    ``received_file_ids`` são os arquivos de ``Recebido/`` que o Hub já viu (``oc:fileid``): a checagem do beat
    avisa a equipe só dos novos. ``checked_at`` vazio = ainda sem a primeira fotografia (não avisa nada)."""

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="acervo_folders")
    path = models.CharField(max_length=1024)
    received_file_ids = models.JSONField(default=list, blank=True)
    checked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Issue Acervo Folder"
        verbose_name_plural = "Issue Acervo Folders"
        db_table = "issue_acervo_folders"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["issue"], condition=Q(deleted_at__isnull=True), name="one_acervo_folder_per_issue"
            )
        ]

    def __str__(self):
        return f"{self.issue_id} -> {self.path}"


class IssueAcervoLink(ProjectBaseModel):
    """Link público do Nextcloud para a pasta da peça: ``upload`` (só envio, em ``Recebido/``) ou ``delivery``
    (leitura, em ``Entrega/``). Um ativo por tipo e peça; revogar marca ``revoked_at`` e apaga no Nextcloud."""

    class Kind(models.TextChoices):
        UPLOAD = "upload", "Upload"
        DELIVERY = "delivery", "Delivery"

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="acervo_links")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    path = models.CharField(max_length=1024)
    share_id = models.CharField(max_length=64)
    token = models.CharField(max_length=64)
    expires_on = models.DateField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Issue Acervo Link"
        verbose_name_plural = "Issue Acervo Links"
        db_table = "issue_acervo_links"
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["issue", "kind"], name="acervo_link_issue_kind_idx")]

    def __str__(self):
        return f"{self.issue_id} -> {self.kind} ({self.share_id})"


@receiver(post_save, sender=Project)
def create_acervo_folder_for_new_project(sender, instance, created, **kwargs):
    """Projeto novo (pela tela, pela API do painel admin ou por modelo) ganha a pasta no Acervo, em segundo plano."""
    if not created or instance.acervo_folder:
        return
    if not (settings.NEXTCLOUD_URL and settings.NEXTCLOUD_USER and settings.NEXTCLOUD_APP_PASSWORD):
        return
    from plane.bgtasks.acervo_task import create_project_folder

    project_id = str(instance.id)
    transaction.on_commit(lambda: create_project_folder.delay(project_id))
