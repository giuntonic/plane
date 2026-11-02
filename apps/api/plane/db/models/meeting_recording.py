# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: gravação de reunião feita no navegador, pelo Hub, com a transcrição e a ata.

Quem grava manda duas faixas em pedaços enquanto a reunião acontece: ``mic`` (a própria voz) e ``tab`` (o áudio
da aba do Meet, com os outros participantes). Os pedaços ficam no bucket em
``meeting-recordings/<id>/<faixa>/<seq>.webm``; no fim, o worker junta cada faixa num arquivo só, transcreve e
apaga os pedaços. A ata (``summary``) é um rascunho até alguém da equipe publicar no item."""

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .project import ProjectBaseModel

TRACKS = ("mic", "tab")
# as duas faixas misturadas, só para ouvir
MIX_TRACK = "mix"
AUDIO_TRACKS = (*TRACKS, MIX_TRACK)


class MeetingRecording(ProjectBaseModel):
    class Status(models.TextChoices):
        RECORDING = "recording", "Recording"
        QUEUED = "queued", "Queued"
        TRANSCRIBING = "transcribing", "Transcribing"
        SUMMARIZING = "summarizing", "Summarizing"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    class SummaryStatus(models.TextChoices):
        NONE = "none", "None"
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="meeting_recordings")
    calendar_event = models.ForeignKey(
        "db.IssueCalendarEvent", on_delete=models.SET_NULL, null=True, blank=True, related_name="recordings"
    )
    title = models.CharField(max_length=1024, blank=True, default="")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RECORDING)
    error = models.TextField(blank=True, default="")
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    mic_chunks = models.PositiveIntegerField(default=0)
    tab_chunks = models.PositiveIntegerField(default=0)
    last_chunk_at = models.DateTimeField(null=True, blank=True)
    # arquivos juntados (para ouvir); somem depois do prazo de guarda, a transcrição fica
    audio_keys = models.JSONField(default=dict, blank=True)
    audio_deleted_at = models.DateTimeField(null=True, blank=True)
    # [{"start": s, "end": s, "speaker": "recorder"|"others", "text": "..."}]
    transcript = models.JSONField(default=list, blank=True)
    transcript_text = models.TextField(blank=True, default="")
    transcribe_model = models.CharField(max_length=64, blank=True, default="")
    transcribed_at = models.DateTimeField(null=True, blank=True)
    # {"resumo": str, "pauta": [str], "decisoes": [str], "proximos_passos": [{...}], "pendencias": [str]}
    summary = models.JSONField(default=dict, blank=True)
    summary_status = models.CharField(max_length=16, choices=SummaryStatus.choices, default=SummaryStatus.NONE)
    summary_source = models.CharField(max_length=32, blank=True, default="")
    client_visible = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    published_comment = models.ForeignKey(
        "db.IssueComment", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        verbose_name = "Meeting Recording"
        verbose_name_plural = "Meeting Recordings"
        db_table = "meeting_recordings"
        ordering = ("-started_at",)
        indexes = [
            models.Index(fields=["issue", "-started_at"], name="meeting_rec_issue_idx"),
            models.Index(fields=["status", "last_chunk_at"], name="meeting_rec_status_idx"),
        ]

    def __str__(self):
        return f"{self.issue_id} {self.started_at:%Y-%m-%d %H:%M}"

    def part_prefix(self, track):
        return f"meeting-recordings/{self.id}/{track}/"

    def part_key(self, track, seq):
        return f"{self.part_prefix(track)}{seq:06d}.webm"

    def audio_key(self, track):
        return f"meeting-recordings/{self.id}/{track}.webm"
