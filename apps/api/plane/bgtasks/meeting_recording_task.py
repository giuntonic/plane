# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: o que acontece depois que uma reunião é gravada pelo Hub.

``transcribe_meeting`` roda na fila ``transcribe`` (worker ``plane-transcriber``, uma reunião por vez):
junta os pedaços de cada faixa num arquivo só (que fica para ouvir), converte, transcreve com o faster-whisper,
junta as duas faixas numa conversa e, se houver motor configurado, faz o rascunho da ata.

``meeting_recordings_housekeeping`` (beat, a cada 10 min) fecha as gravações abandonadas (aba fechada no meio,
sem pedaço novo há 30 min) com o que chegou, e apaga o áudio que passou do prazo de guarda."""

# Python imports
import logging
import os
import tempfile
from datetime import timedelta

# Django imports
from django.conf import settings
from django.db import transaction
from django.utils import timezone

# Third party imports
from celery import shared_task

# Module imports
from plane.db.models import MeetingRecording, ProjectMember
from plane.db.models.meeting_recording import MIX_TRACK, TRACKS
from plane.settings.storage import S3Storage
from plane.utils.exception_logger import log_exception
from plane.utils.meeting_summary import SummaryError, draft_summary
from plane.utils.meeting_transcription import merge_tracks, mix_tracks, to_wav, transcribe_wav, transcript_text

logger = logging.getLogger(__name__)

TRANSCRIBE_QUEUE = "transcribe"
ABANDONED_AFTER = timedelta(minutes=30)
STALE_TRANSCRIBING = timedelta(hours=6)


def queue_transcription(recording):
    """Marca a gravação para transcrever e manda para a fila depois do commit."""
    recording.status = MeetingRecording.Status.QUEUED
    recording.error = ""
    recording.save(update_fields=["status", "error", "updated_at"], disable_auto_set_user=True)
    recording_id = str(recording.id)
    transaction.on_commit(lambda: transcribe_meeting.apply_async(args=[recording_id], queue=TRANSCRIBE_QUEUE))


def finish_recording(recording, duration_seconds=None, now=None):
    """Fecha a gravação: sem nenhum pedaço, apaga; com pedaços, manda transcrever."""
    now = now or timezone.now()
    if not recording.mic_chunks and not recording.tab_chunks:
        recording.delete(soft=False)
        return None
    recording.ended_at = now
    if duration_seconds is None:
        duration_seconds = int((now - recording.started_at).total_seconds())
    recording.duration_seconds = max(0, min(int(duration_seconds), 12 * 3600))
    recording.save(update_fields=["ended_at", "duration_seconds", "updated_at"], disable_auto_set_user=True)
    queue_transcription(recording)
    return recording


def _list_parts(storage, prefix):
    keys = []
    paginator = storage.s3_client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=storage.aws_storage_bucket_name, Prefix=prefix):
        keys.extend(item["Key"] for item in page.get("Contents", []))
    return sorted(keys)


def _join_track(storage, recording, track, workdir):
    """Junta os pedaços (o MediaRecorder grava um WebM contínuo cortado em pedaços: basta concatenar em ordem)
    e guarda o arquivo inteiro no bucket. Devolve o caminho local, ou None se a faixa não tem áudio."""
    combined_key = recording.audio_key(track)
    local = os.path.join(workdir, f"{track}.webm")
    parts = _list_parts(storage, recording.part_prefix(track))
    if parts:
        with open(local, "wb") as out:
            for key in parts:
                body = storage.s3_client.get_object(Bucket=storage.aws_storage_bucket_name, Key=key)["Body"]
                for chunk in iter(lambda: body.read(1024 * 1024), b""):
                    out.write(chunk)
        with open(local, "rb") as handle:
            if not storage.upload_file(handle, combined_key, content_type="audio/webm", extra_args={}):
                raise RuntimeError(f"não foi possível gravar {combined_key}")
        recording.audio_keys = {**(recording.audio_keys or {}), track: combined_key}
        recording.save(update_fields=["audio_keys", "updated_at"], disable_auto_set_user=True)
        storage.delete_files(parts)
        return local
    if (recording.audio_keys or {}).get(track):
        # nova tentativa: os pedaços já viraram o arquivo inteiro
        storage.s3_client.download_file(storage.aws_storage_bucket_name, combined_key, local)
        return local
    return None


def _store_mix(storage, recording, sources, workdir):
    """O arquivo para ouvir: as duas faixas misturadas (ou a única que houver). Sem ele, só não há player."""
    if len(sources) < 2 or (recording.audio_keys or {}).get(MIX_TRACK):
        return
    mixed = os.path.join(workdir, "mix.webm")
    try:
        mix_tracks(sources["mic"], sources["tab"], mixed)
        with open(mixed, "rb") as handle:
            if storage.upload_file(handle, recording.audio_key(MIX_TRACK), content_type="audio/webm", extra_args={}):
                recording.audio_keys = {**(recording.audio_keys or {}), MIX_TRACK: recording.audio_key(MIX_TRACK)}
                recording.save(update_fields=["audio_keys", "updated_at"], disable_auto_set_user=True)
    except Exception as e:
        log_exception(e)


def _members(recording):
    return [
        member.member
        for member in ProjectMember.objects.filter(
            project_id=recording.project_id, is_active=True, role__gte=15
        ).select_related("member")
    ]


@shared_task(acks_late=True, time_limit=8 * 3600)
def transcribe_meeting(recording_id):
    recording = MeetingRecording.objects.filter(pk=recording_id).select_related("issue", "created_by").first()
    if not recording or recording.status in (MeetingRecording.Status.READY, MeetingRecording.Status.RECORDING):
        return
    if (
        recording.status == MeetingRecording.Status.TRANSCRIBING
        and timezone.now() - recording.updated_at < STALE_TRANSCRIBING
    ):
        return
    recording.status = MeetingRecording.Status.TRANSCRIBING
    recording.save(update_fields=["status", "updated_at"], disable_auto_set_user=True)
    storage = S3Storage()
    try:
        with tempfile.TemporaryDirectory(dir=settings.TRANSCRIBE_TMP_DIR) as workdir:
            segments, sources = {}, {}
            for track in TRACKS:
                source = _join_track(storage, recording, track, workdir)
                if not source:
                    segments[track] = []
                    continue
                sources[track] = source
                wav = os.path.join(workdir, f"{track}.wav")
                to_wav(source, wav)
                segments[track] = transcribe_wav(wav)
            _store_mix(storage, recording, sources, workdir)
        merged = merge_tracks(segments["mic"], segments["tab"])
        recorder = recording.created_by
        recorder_name = (recorder.display_name or recorder.first_name or "Quem gravou") if recorder else "Quem gravou"
        recording.transcript = merged
        recording.transcript_text = transcript_text(merged, recorder_name)
        recording.transcribe_model = settings.TRANSCRIBE_MODEL
        recording.transcribed_at = timezone.now()
        recording.status = MeetingRecording.Status.SUMMARIZING
        # sem usuário logado no worker, o save comum apagaria quem gravou (created_by)
        recording.save(disable_auto_set_user=True)
    except Exception as e:
        log_exception(e)
        recording.status = MeetingRecording.Status.FAILED
        recording.error = str(e)[:2000]
        recording.save(update_fields=["status", "error", "updated_at"], disable_auto_set_user=True)
        return

    # O rascunho automático é opcional: se falhar, a transcrição fica e a equipe escreve a ata.
    error = ""
    if recording.summary_status == MeetingRecording.SummaryStatus.NONE:
        try:
            draft = draft_summary(recording.transcript_text, recording.issue.name, _members(recording))
            if draft:
                recording.summary = draft
                recording.summary_status = MeetingRecording.SummaryStatus.DRAFT
                recording.summary_source = settings.MEETING_SUMMARY_ENGINE
        except SummaryError as e:
            logger.warning("Rascunho da ata não gerado (%s): %s", recording.id, e)
            error = str(e)[:2000]
    recording.status = MeetingRecording.Status.READY
    recording.error = error
    recording.save(disable_auto_set_user=True)


@shared_task
def meeting_recordings_housekeeping():
    now = timezone.now()
    finished = 0
    for recording in MeetingRecording.objects.filter(status=MeetingRecording.Status.RECORDING):
        last = recording.last_chunk_at or recording.started_at
        if now - last >= ABANDONED_AFTER:
            finish_recording(recording, now=last)
            finished += 1

    purged = 0
    days = settings.MEETING_AUDIO_RETENTION_DAYS
    if days > 0:
        storage = None
        old = MeetingRecording.objects.filter(
            audio_deleted_at__isnull=True,
            started_at__lt=now - timedelta(days=days),
            status__in=[MeetingRecording.Status.READY, MeetingRecording.Status.FAILED],
        )
        for recording in old:
            keys = [key for key in (recording.audio_keys or {}).values() if key]
            try:
                if keys:
                    storage = storage or S3Storage()
                    storage.delete_files(keys)
            except Exception as e:
                log_exception(e)
                continue
            recording.audio_keys = {}
            recording.audio_deleted_at = now
            recording.save(update_fields=["audio_keys", "audio_deleted_at", "updated_at"], disable_auto_set_user=True)
            purged += 1
    return {"finished": finished, "purged_audio": purged}
