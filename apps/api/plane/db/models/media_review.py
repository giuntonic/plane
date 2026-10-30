# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .project import ProjectBaseModel


class MediaReviewComment(ProjectBaseModel):
    """Pespo: comentário da revisão de uma peça (o que o Clapshot fazia), preso a um anexo do item.

    No vídeo, ``timecode`` é o segundo do comentário; na imagem, ``x``/``y`` são o ponto em % da
    largura e da altura. ``drawing`` guarda o desenho por cima do quadro, com coordenadas de 0 a 1
    (ver ``plane/app/serializers/media_review.py``). Respostas têm ``parent`` e não têm posição.

    Cada comentário tem uma cópia em ``comment`` (comentário comum do item, no formato que o portal
    do cliente e a Marcação da Peça antiga já liam), para notificar quem segue o item. Apagar o
    comentário da revisão apaga a cópia; apagar só a cópia no feed deixa o da revisão.
    Sem soft delete: sai de verdade, com as respostas."""

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="media_review_comments")
    asset = models.ForeignKey("db.FileAsset", on_delete=models.CASCADE, related_name="media_review_comments")
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, blank=True, related_name="replies")
    timecode = models.FloatField(null=True, blank=True)
    x = models.FloatField(null=True, blank=True)
    y = models.FloatField(null=True, blank=True)
    drawing = models.JSONField(default=list, blank=True)
    text = models.TextField(blank=True, default="")
    comment = models.OneToOneField(
        "db.IssueComment", on_delete=models.SET_NULL, null=True, blank=True, related_name="media_review_comment"
    )
    edited_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_media_review_comments",
    )

    class Meta:
        verbose_name = "Media Review Comment"
        verbose_name_plural = "Media Review Comments"
        db_table = "media_review_comments"
        ordering = ("created_at",)

    def __str__(self):
        return f"{self.asset_id} -> {self.text[:50]}"
