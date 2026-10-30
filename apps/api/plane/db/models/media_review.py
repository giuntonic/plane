# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models, transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

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


class MediaRendition(models.Model):
    """Pespo: o que a conversão gerou para um vídeo anexado (``plane/bgtasks/media_review_task.py``).

    ``playback_key`` é uma cópia em MP4 (H.264/AAC, até 1080p) quando o original não toca bem no
    navegador; vazio quando o original já serve. ``poster_key`` é um quadro do vídeo e ``sprite_key`` uma
    grade de miniaturas para a linha do tempo, descrita em ``sprite`` (intervalo, colunas, linhas e
    tamanho de cada miniatura). Os arquivos ficam no mesmo bucket, em ``media-review/<id do anexo>/``."""

    class Status(models.TextChoices):
        PENDING = "pending"
        PROCESSING = "processing"
        READY = "ready"
        FAILED = "failed"

    asset = models.OneToOneField(
        "db.FileAsset", on_delete=models.CASCADE, primary_key=True, related_name="media_rendition"
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    duration = models.FloatField(null=True, blank=True)
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    fps = models.FloatField(null=True, blank=True)
    video_codec = models.CharField(max_length=32, blank=True, default="")
    playback_key = models.CharField(max_length=800, blank=True, default="")
    poster_key = models.CharField(max_length=800, blank=True, default="")
    sprite_key = models.CharField(max_length=800, blank=True, default="")
    sprite = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True, default="")
    attempts = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Media Rendition"
        verbose_name_plural = "Media Renditions"
        db_table = "media_renditions"

    def __str__(self):
        return f"{self.asset_id} -> {self.status}"


@receiver(post_delete, sender=MediaRendition)
def delete_rendition_files_on_delete(sender, instance, **kwargs):
    """Os arquivos gerados saem do bucket junto com o registro (o anexo apagado de vez leva os dois)."""
    keys = [key for key in (instance.playback_key, instance.poster_key, instance.sprite_key) if key]
    if not keys:
        return
    from plane.bgtasks.media_review_task import delete_rendition_files

    transaction.on_commit(lambda: delete_rendition_files.delay(keys))
