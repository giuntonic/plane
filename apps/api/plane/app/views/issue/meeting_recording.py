# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: reuniões gravadas pelo Hub, no item (…/issues/<id>/meeting-recordings/…).

Só a equipe (admin e membro do projeto) grava, vê a transcrição e escreve a ata. O cliente vê a ata quando ela
é publicada como visível para ele (vira um comentário do item); publicada só para a equipe, o comentário some
para convidados (``team_only_comments``) e não notifica ninguém por e-mail."""

# Python imports
import uuid

# Django imports
from django.conf import settings
from django.db import transaction
from django.db.models import F, Max
from django.db.models.functions import Greatest
from django.http import HttpResponseRedirect
from django.utils import timezone

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from .media_review import _comment_activity, _snapshot
from plane.app.permissions import ROLE, allow_permission
from plane.bgtasks.meeting_recording_task import finish_recording, queue_transcription
from plane.db.models import (
    Issue,
    IssueCalendarEvent,
    IssueChecklistItem,
    IssueComment,
    MeetingRecording,
    ProjectMember,
)
from plane.db.models.meeting_recording import AUDIO_TRACKS, MIX_TRACK, TRACKS
from plane.settings.storage import S3Storage
from plane.utils.exception_logger import log_exception
from plane.utils.meeting_summary import clean_summary, empty_summary, summary_html
from plane.utils.team_only_comments import MEETING_CLIENT_SOURCE, MEETING_TEAM_SOURCE

MAX_SEQ = 100_000
AUDIO_URL_EXPIRATION = 6 * 3600


def recording_data(recording, detail=False):
    creator = recording.created_by
    data = {
        "id": str(recording.id),
        "issue": str(recording.issue_id),
        "project": str(recording.project_id),
        "calendar_event": str(recording.calendar_event_id) if recording.calendar_event_id else None,
        "title": recording.title,
        "status": recording.status,
        "error": recording.error,
        "started_at": recording.started_at,
        "ended_at": recording.ended_at,
        "duration_seconds": recording.duration_seconds,
        "chunks": {"mic": recording.mic_chunks, "tab": recording.tab_chunks},
        "created_by": str(recording.created_by_id) if recording.created_by_id else None,
        "created_by_name": (creator.display_name or creator.first_name) if creator else "",
        "transcribe_model": recording.transcribe_model,
        "transcribed_at": recording.transcribed_at,
        "summary": recording.summary or empty_summary(),
        "summary_status": recording.summary_status,
        "summary_source": recording.summary_source,
        "client_visible": recording.client_visible,
        "published_at": recording.published_at,
        "published_comment": str(recording.published_comment_id) if recording.published_comment_id else None,
        "audio": {track: bool((recording.audio_keys or {}).get(track)) for track in AUDIO_TRACKS},
        # o que tocar no player: a mistura, ou a única faixa que houver
        "playback_track": next((t for t in (MIX_TRACK, "tab", "mic") if (recording.audio_keys or {}).get(t)), None),
        "audio_deleted_at": recording.audio_deleted_at,
    }
    if detail:
        data["transcript"] = recording.transcript or []
    return data


def _project_role(user, project_id):
    return (
        ProjectMember.objects.filter(project_id=project_id, member=user, is_active=True)
        .values_list("role", flat=True)
        .first()
    )


def _team_member_ids(project_id):
    return list(
        ProjectMember.objects.filter(project_id=project_id, is_active=True, role__gte=ROLE.MEMBER.value).values_list(
            "member_id", flat=True
        )
    )


def _get_recording(slug, project_id, issue_id, pk):
    try:
        uuid.UUID(str(pk))
    except ValueError:
        return None
    return (
        MeetingRecording.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id, issue__project_id=project_id, pk=pk
        )
        .select_related("issue", "issue__project", "issue__workspace", "created_by", "calendar_event")
        .first()
    )


class IssueMeetingRecordingEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id, issue_id):
        recordings = MeetingRecording.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id
        ).select_related("created_by")
        return Response([recording_data(r) for r in recordings], status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        """Começa uma gravação. Uma por pessoa: com outra em andamento, responde 409 com ela."""
        issue = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        active = (
            MeetingRecording.objects.filter(created_by=request.user, status=MeetingRecording.Status.RECORDING)
            .select_related("created_by")
            .first()
        )
        if active:
            return Response(
                {"error": "RECORDING_IN_PROGRESS", "recording": recording_data(active)},
                status=status.HTTP_409_CONFLICT,
            )
        event = None
        event_id = request.data.get("calendar_event")
        if event_id:
            try:
                event = IssueCalendarEvent.objects.filter(issue=issue, pk=uuid.UUID(str(event_id))).first()
            except ValueError:
                event = None
            if not event:
                return Response({"error": "Meeting not found"}, status=status.HTTP_400_BAD_REQUEST)
        title = (request.data.get("title") or (event.summary if event else "") or issue.name).strip()[:1024]
        recording = MeetingRecording.objects.create(
            issue=issue,
            project_id=project_id,
            calendar_event=event,
            title=title,
            started_at=timezone.now(),
        )
        recording.refresh_from_db()
        return Response(recording_data(recording), status=status.HTTP_201_CREATED)


class MeetingRecordingChunkEndpoint(BaseAPIView):
    """Um pedaço de uma faixa (``mic`` ou ``tab``), na ordem ``seq``. Mandar de novo o mesmo pedaço substitui."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id, pk):
        recording = _get_recording(slug, project_id, issue_id, pk)
        if not recording:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        if recording.created_by_id != request.user.id:
            return Response({"error": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)
        if recording.status != MeetingRecording.Status.RECORDING:
            return Response({"error": "RECORDING_FINISHED"}, status=status.HTTP_409_CONFLICT)
        track = request.data.get("track")
        try:
            seq = int(request.data.get("seq"))
        except (TypeError, ValueError):
            seq = -1
        upload = request.FILES.get("file")
        if track not in TRACKS or not 0 <= seq < MAX_SEQ or not upload:
            return Response({"error": "Invalid chunk"}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size > settings.MEETING_CHUNK_MAX_BYTES:
            return Response({"error": "CHUNK_TOO_LARGE"}, status=status.HTTP_400_BAD_REQUEST)
        if not S3Storage(request=request).upload_file(
            upload, recording.part_key(track, seq), content_type="audio/webm", extra_args={}
        ):
            return Response({"error": "UPLOAD_FAILED"}, status=status.HTTP_502_BAD_GATEWAY)
        field = f"{track}_chunks"
        MeetingRecording.objects.filter(pk=recording.pk).update(
            last_chunk_at=timezone.now(), updated_at=timezone.now(), **{field: Greatest(F(field), seq + 1)}
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeetingRecordingFinishEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id, pk):
        recording = _get_recording(slug, project_id, issue_id, pk)
        if not recording:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        if recording.created_by_id != request.user.id and _project_role(request.user, project_id) != ROLE.ADMIN.value:
            return Response({"error": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)
        if recording.status != MeetingRecording.Status.RECORDING:
            return Response(recording_data(recording), status=status.HTTP_200_OK)
        try:
            duration = int(request.data.get("duration_seconds"))
        except (TypeError, ValueError):
            duration = None
        with transaction.atomic():
            finished = finish_recording(recording, duration)
        if not finished:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(recording_data(finished), status=status.HTTP_200_OK)


class MeetingRecordingDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id, issue_id, pk):
        recording = _get_recording(slug, project_id, issue_id, pk)
        if not recording:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(recording_data(recording, detail=True), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, issue_id, pk):
        """A ata (``summary``) e o título. A ata editada fica como rascunho até publicar de novo."""
        recording = _get_recording(slug, project_id, issue_id, pk)
        if not recording:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        fields = ["updated_at"]
        if "title" in request.data:
            recording.title = str(request.data.get("title") or "").strip()[:1024] or recording.issue.name
            fields.append("title")
        if "summary" in request.data:
            try:
                recording.summary = clean_summary(request.data.get("summary"), _team_member_ids(project_id))
            except ValueError as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
            if recording.summary_status == MeetingRecording.SummaryStatus.NONE:
                recording.summary_status = MeetingRecording.SummaryStatus.DRAFT
            if not recording.summary_source:
                recording.summary_source = "manual"
            fields += ["summary", "summary_status", "summary_source"]
        recording.save(update_fields=fields)
        return Response(recording_data(recording, detail=True), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, issue_id, pk):
        """Apaga a gravação, o áudio e a transcrição (o comentário publicado fica no item)."""
        recording = _get_recording(slug, project_id, issue_id, pk)
        if not recording:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        if recording.created_by_id != request.user.id and _project_role(request.user, project_id) != ROLE.ADMIN.value:
            return Response({"error": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)
        storage = S3Storage(request=request)
        keys = [key for key in (recording.audio_keys or {}).values() if key]
        try:
            for track in TRACKS:
                for page in storage.s3_client.get_paginator("list_objects_v2").paginate(
                    Bucket=storage.aws_storage_bucket_name, Prefix=recording.part_prefix(track)
                ):
                    keys.extend(item["Key"] for item in page.get("Contents", []))
            if keys:
                storage.delete_files(keys)
        except Exception as e:
            log_exception(e)
        recording.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeetingRecordingPublishEndpoint(BaseAPIView):
    """Publica a ata no item como comentário (ou atualiza o que já foi publicado)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id, pk):
        recording = _get_recording(slug, project_id, issue_id, pk)
        if not recording:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        summary = recording.summary or {}
        if not any(summary.get(field) for field in ("resumo", "pauta", "decisoes", "proximos_passos", "pendencias")):
            return Response({"error": "EMPTY_SUMMARY"}, status=status.HTTP_400_BAD_REQUEST)
        client_visible = request.data.get("client_visible") is True
        when = timezone.localtime(recording.started_at).strftime("%d/%m/%Y %H:%M")
        comment_html = summary_html(summary, recording.title or recording.issue.name, when)
        source = MEETING_CLIENT_SOURCE if client_visible else MEETING_TEAM_SOURCE
        issue = recording.issue
        with transaction.atomic():
            comment = recording.published_comment
            if comment and comment.deleted_at is None:
                current = _snapshot(comment)
                comment.comment_html = comment_html
                comment.external_source = source
                comment.edited_at = timezone.now()
                comment.save()
                kind = "updated"
            else:
                comment = IssueComment.objects.create(
                    issue=issue,
                    project_id=project_id,
                    actor=request.user,
                    comment_html=comment_html,
                    external_source=source,
                )
                current = None
                kind = "created"
            # Ata só da equipe não passa pelo histórico: a notificação por e-mail chegaria ao cliente.
            if client_visible:
                _comment_activity(kind, request, issue, comment, current_instance=current)
            recording.published_comment = comment
            recording.client_visible = client_visible
            recording.summary_status = MeetingRecording.SummaryStatus.PUBLISHED
            recording.published_at = timezone.now()
            recording.published_by = request.user
            recording.save(
                update_fields=[
                    "published_comment",
                    "client_visible",
                    "summary_status",
                    "published_at",
                    "published_by",
                    "updated_at",
                ]
            )
        return Response(recording_data(recording, detail=True), status=status.HTTP_200_OK)


class MeetingRecordingSubtasksEndpoint(BaseAPIView):
    """Transforma próximos passos da ata em subtarefas do item, com responsável e prazo."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id, pk):
        recording = _get_recording(slug, project_id, issue_id, pk)
        if not recording:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        indexes = request.data.get("indexes")
        steps = list((recording.summary or {}).get("proximos_passos") or [])
        if not isinstance(indexes, list) or not all(isinstance(i, int) and 0 <= i < len(steps) for i in indexes):
            return Response({"error": "Invalid indexes"}, status=status.HTTP_400_BAD_REQUEST)
        members = {str(member_id) for member_id in _team_member_ids(project_id)}
        created = 0
        with transaction.atomic():
            top = (
                IssueChecklistItem.objects.filter(issue_id=issue_id, parent__isnull=True, checklist__isnull=True)
                .aggregate(top=Max("sort_order"))
                .get("top")
            )
            sort_order = (top or 0) + 1000
            for index in sorted(set(indexes)):
                step = dict(steps[index])
                if step.get("subtask_id"):
                    continue
                assignee = step.get("responsavel_id")
                item = IssueChecklistItem.objects.create(
                    issue_id=issue_id,
                    project_id=project_id,
                    name=step.get("tarefa") or "",
                    assignee_id=assignee if assignee in members else None,
                    due_date=step.get("prazo") or None,
                    sort_order=sort_order,
                )
                sort_order += 1000
                step["subtask_id"] = str(item.id)
                steps[index] = step
                created += 1
            recording.summary = {**(recording.summary or empty_summary()), "proximos_passos": steps}
            if recording.summary_status == MeetingRecording.SummaryStatus.NONE:
                recording.summary_status = MeetingRecording.SummaryStatus.DRAFT
            recording.save(update_fields=["summary", "summary_status", "updated_at"])
        data = recording_data(recording, detail=True)
        data["created"] = created
        return Response(data, status=status.HTTP_200_OK)


class MeetingRecordingRetryEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id, pk):
        recording = _get_recording(slug, project_id, issue_id, pk)
        if not recording:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        if recording.status != MeetingRecording.Status.FAILED:
            return Response({"error": "NOT_FAILED"}, status=status.HTTP_409_CONFLICT)
        with transaction.atomic():
            queue_transcription(recording)
        return Response(recording_data(recording), status=status.HTTP_200_OK)


class MeetingRecordingAudioEndpoint(BaseAPIView):
    """O áudio de uma faixa (``mic`` ou ``tab``), por uma URL assinada que vale 6 h (o player busca trechos)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id, issue_id, pk, track):
        recording = _get_recording(slug, project_id, issue_id, pk)
        key = (recording.audio_keys or {}).get(track) if recording and track in AUDIO_TRACKS else None
        if not key:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        url = S3Storage(request=request).generate_presigned_url(
            object_name=key,
            expiration=AUDIO_URL_EXPIRATION,
            disposition="inline",
            filename=f"reuniao-{track}.webm",
            content_type="audio/webm",
        )
        if not url:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        return HttpResponseRedirect(url)
