# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: reuniões gravadas pelo Hub (…/meeting-recordings/…), o worker de transcrição e o "Solicitar reunião".

Nada sai da máquina: o bucket, o faster-whisper, o Ollama e o Google são trocados por versões de teste."""

import io
import json
import os
from datetime import date, datetime, time, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.bgtasks import meeting_recording_task as task
from plane.db.models import (
    GoogleCalendarConnection,
    Issue,
    IssueCalendarEvent,
    IssueChecklistItem,
    IssueComment,
    MeetingRecording,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)
from plane.utils import meeting_booking as booking
from plane.utils.meeting_transcription import merge_tracks

SP = ZoneInfo("America/Sao_Paulo")


class FakeStorage:
    """Um bucket em memória com o pedaço da API do S3Storage que as reuniões usam."""

    objects = {}

    def __init__(self, *args, **kwargs):
        self.aws_storage_bucket_name = "bucket"
        self.s3_client = mock.MagicMock()
        self.s3_client.get_paginator.return_value.paginate.side_effect = lambda Bucket, Prefix: [
            {"Contents": [{"Key": key} for key in sorted(self.objects) if key.startswith(Prefix)]}
        ]
        self.s3_client.get_object.side_effect = lambda Bucket, Key: {"Body": io.BytesIO(self.objects[Key])}
        self.s3_client.download_file.side_effect = lambda bucket, key, path: open(path, "wb").write(self.objects[key])

    def upload_file(self, file_obj, object_name, content_type=None, extra_args=None):
        self.objects[object_name] = file_obj.read()
        return True

    def delete_files(self, keys):
        for key in keys:
            self.objects.pop(key, None)
        return True

    def generate_presigned_url(self, object_name, **kwargs):
        return f"https://bucket.example/{object_name}"


@pytest.fixture(autouse=True)
def fake_storage():
    FakeStorage.objects = {}
    with (
        mock.patch("plane.app.views.issue.meeting_recording.S3Storage", FakeStorage),
        mock.patch("plane.bgtasks.meeting_recording_task.S3Storage", FakeStorage),
    ):
        yield FakeStorage


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Cliente", identifier="CLI", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def issue(db, project):
    state = State.objects.create(name="Todo", group="unstarted", project=project, workspace=project.workspace)
    return Issue.objects.create(name="Campanha", project=project, workspace=project.workspace, state=state)


def _client(workspace, project, role, email, display_name=None):
    user = User.objects.create(
        email=email, username=email.split("@")[0], display_name=display_name or email.split("@")[0]
    )
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    ProjectMember.objects.create(project=project, member=user, role=role, is_active=True)
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


def _url(name, issue, **kwargs):
    return reverse(
        name, kwargs={"slug": issue.workspace.slug, "project_id": issue.project_id, "issue_id": issue.id, **kwargs}
    )


def _chunk(client, issue, recording_id, track, seq, data=b"webm"):
    return client.post(
        _url("issue-meeting-recording-chunks", issue, pk=recording_id),
        {"track": track, "seq": seq, "file": SimpleUploadedFile("c.webm", data, content_type="audio/webm")},
        format="multipart",
    )


@pytest.mark.contract
@pytest.mark.django_db
class TestMeetingRecordings:
    def test_record_upload_and_finish(self, session_client, issue, django_capture_on_commit_callbacks):
        event = IssueCalendarEvent.objects.create(
            issue=issue,
            project=issue.project,
            workspace=issue.workspace,
            google_event_id="ev1",
            calendar_id="primary",
            summary="Alinhamento",
        )
        created = session_client.post(_url("issue-meeting-recordings", issue), {"calendar_event": str(event.id)})
        assert created.status_code == status.HTTP_201_CREATED
        assert created.data["title"] == "Alinhamento"
        rid = created.data["id"]

        assert _chunk(session_client, issue, rid, "mic", 0).status_code == status.HTTP_204_NO_CONTENT
        assert _chunk(session_client, issue, rid, "tab", 0).status_code == status.HTTP_204_NO_CONTENT
        assert _chunk(session_client, issue, rid, "tab", 1).status_code == status.HTTP_204_NO_CONTENT
        recording = MeetingRecording.objects.get(pk=rid)
        assert (recording.mic_chunks, recording.tab_chunks) == (1, 2)
        assert f"meeting-recordings/{rid}/tab/000001.webm" in FakeStorage.objects

        with (
            mock.patch.object(task.transcribe_meeting, "apply_async") as queued,
            django_capture_on_commit_callbacks(execute=True),
        ):
            finished = session_client.post(
                _url("issue-meeting-recording-finish", issue, pk=rid), {"duration_seconds": 95}, format="json"
            )
        assert finished.status_code == status.HTTP_200_OK
        assert finished.data["status"] == "queued"
        assert finished.data["duration_seconds"] == 95
        queued.assert_called_once_with(args=[rid], queue="transcribe")
        assert _chunk(session_client, issue, rid, "mic", 1).status_code == status.HTTP_409_CONFLICT

    def test_finishing_without_audio_discards_it(self, session_client, issue):
        rid = session_client.post(_url("issue-meeting-recordings", issue)).data["id"]
        response = session_client.post(_url("issue-meeting-recording-finish", issue, pk=rid), {}, format="json")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not MeetingRecording.objects.filter(pk=rid).exists()

    def test_one_recording_at_a_time(self, session_client, issue):
        first = session_client.post(_url("issue-meeting-recordings", issue)).data
        again = session_client.post(_url("issue-meeting-recordings", issue))
        assert again.status_code == status.HTTP_409_CONFLICT
        assert again.data["error"] == "RECORDING_IN_PROGRESS"
        assert again.data["recording"]["id"] == first["id"]

    def test_chunk_rules(self, session_client, workspace, project, issue):
        rid = session_client.post(_url("issue-meeting-recordings", issue)).data["id"]
        assert _chunk(session_client, issue, rid, "camera", 0).status_code == status.HTTP_400_BAD_REQUEST
        assert _chunk(session_client, issue, rid, "mic", -1).status_code == status.HTTP_400_BAD_REQUEST
        with override_settings(MEETING_CHUNK_MAX_BYTES=3):
            assert _chunk(session_client, issue, rid, "mic", 0, b"12345").status_code == status.HTTP_400_BAD_REQUEST
        other, _ = _client(workspace, project, 15, "editor@plane.so")
        assert _chunk(other, issue, rid, "mic", 0).status_code == status.HTTP_403_FORBIDDEN

    def test_clients_cannot_see_recordings(self, workspace, project, issue):
        guest, _ = _client(workspace, project, 5, "cliente@plane.so")
        assert guest.get(_url("issue-meeting-recordings", issue)).status_code == status.HTTP_403_FORBIDDEN
        assert guest.post(_url("issue-meeting-recordings", issue)).status_code == status.HTTP_403_FORBIDDEN

    def test_minutes_publish_team_only_then_for_client(self, session_client, issue, create_user):
        rid = session_client.post(_url("issue-meeting-recordings", issue)).data["id"]
        empty = session_client.post(_url("issue-meeting-recording-publish", issue, pk=rid), {}, format="json")
        assert empty.status_code == status.HTTP_400_BAD_REQUEST

        summary = {
            "resumo": "Fechamos a campanha <de natal>.",
            "pauta": ["Peças", ""],
            "decisoes": ["Três posts"],
            "proximos_passos": [
                {"tarefa": "Roteiro", "responsavel_id": str(create_user.id), "prazo": "2026-11-10"},
                {"tarefa": "Fotos", "responsavel_id": "00000000-0000-0000-0000-000000000000", "prazo": "amanhã"},
            ],
            "pendencias": [],
        }
        patched = session_client.patch(
            _url("issue-meeting-recording-detail", issue, pk=rid), {"summary": summary}, format="json"
        )
        assert patched.status_code == status.HTTP_200_OK
        assert patched.data["summary_status"] == "draft"
        assert patched.data["summary"]["pauta"] == ["Peças"]
        steps = patched.data["summary"]["proximos_passos"]
        assert steps[0]["responsavel_id"] == str(create_user.id)
        assert steps[1]["responsavel_id"] is None and steps[1]["prazo"] is None

        with mock.patch("plane.app.views.issue.meeting_recording._comment_activity") as activity:
            team = session_client.post(
                _url("issue-meeting-recording-publish", issue, pk=rid), {"client_visible": False}, format="json"
            )
            assert team.status_code == status.HTTP_200_OK
            activity.assert_not_called()
            comment = IssueComment.objects.get(pk=team.data["published_comment"])
            assert comment.external_source == "pespo_meeting_team"
            assert "&lt;de natal&gt;" in comment.comment_html and "até 10/11/2026" in comment.comment_html

            client = session_client.post(
                _url("issue-meeting-recording-publish", issue, pk=rid), {"client_visible": True}, format="json"
            )
            assert client.data["published_comment"] == str(comment.id)
            comment.refresh_from_db()
            assert comment.external_source == "pespo_meeting"
            assert activity.call_args[0][0] == "updated"

    def test_next_steps_become_subtasks_once(self, session_client, issue, create_user):
        rid = session_client.post(_url("issue-meeting-recordings", issue)).data["id"]
        session_client.patch(
            _url("issue-meeting-recording-detail", issue, pk=rid),
            {
                "summary": {
                    "proximos_passos": [
                        {"tarefa": "Roteiro", "responsavel_id": str(create_user.id), "prazo": "2026-11-10"},
                        {"tarefa": "Fotos"},
                    ]
                }
            },
            format="json",
        )
        url = _url("issue-meeting-recording-subtasks", issue, pk=rid)
        first = session_client.post(url, {"indexes": [0, 1]}, format="json")
        assert first.status_code == status.HTTP_200_OK
        assert first.data["created"] == 2
        item = IssueChecklistItem.objects.get(issue=issue, name="Roteiro")
        assert item.assignee_id == create_user.id and item.due_date == date(2026, 11, 10)
        again = session_client.post(url, {"indexes": [0]}, format="json")
        assert again.data["created"] == 0
        assert IssueChecklistItem.objects.filter(issue=issue).count() == 2
        assert session_client.post(url, {"indexes": [5]}, format="json").status_code == status.HTTP_400_BAD_REQUEST

    def test_audio_link_and_delete(self, session_client, issue):
        rid = session_client.post(_url("issue-meeting-recordings", issue)).data["id"]
        recording = MeetingRecording.objects.get(pk=rid)
        recording.audio_keys = {"tab": recording.audio_key("tab")}
        recording.status = MeetingRecording.Status.READY
        recording.save(update_fields=["audio_keys", "status"])
        FakeStorage.objects[recording.audio_key("tab")] = b"audio"
        audio = session_client.get(_url("issue-meeting-recording-audio", issue, pk=rid, track="tab"))
        assert audio.status_code == status.HTTP_302_FOUND
        assert session_client.get(_url("issue-meeting-recording-audio", issue, pk=rid, track="mic")).status_code == 404
        assert session_client.delete(_url("issue-meeting-recording-detail", issue, pk=rid)).status_code == 204
        assert not FakeStorage.objects


@pytest.mark.django_db
class TestTranscriptionWorker:
    def _recording(self, issue, user, **kwargs):
        recording = MeetingRecording(
            issue=issue, project=issue.project, started_at=timezone.now() - timedelta(hours=1), **kwargs
        )
        recording.save(created_by_id=user.id)
        return recording

    def test_merge_drops_echo_and_orders_by_time(self):
        tab = [{"start": 0.0, "end": 3.0, "text": "Bom dia, vamos começar"}]
        mic = [
            {"start": 0.5, "end": 3.2, "text": "bom dia vamos começar"},
            {"start": 4.0, "end": 6.0, "text": "Pode falar"},
        ]
        merged = merge_tracks(mic, tab)
        assert [(m["speaker"], m["text"]) for m in merged] == [
            ("others", "Bom dia, vamos começar"),
            ("recorder", "Pode falar"),
        ]

    def test_transcribes_both_tracks_and_keeps_the_recorder(self, issue, create_user):
        create_user.display_name = "Giuliano"
        create_user.save()
        recording = self._recording(issue, create_user, status=MeetingRecording.Status.QUEUED, mic_chunks=2)
        FakeStorage.objects[recording.part_key("mic", 0)] = b"AA"
        FakeStorage.objects[recording.part_key("mic", 1)] = b"BB"
        FakeStorage.objects[recording.part_key("tab", 0)] = b"CC"

        def fake_transcribe(path):
            if os.path.basename(path).startswith("mic"):
                assert open(path.replace(".wav", ".webm"), "rb").read() == b"AABB"
                return [{"start": 5.0, "end": 7.0, "text": "Combinado então"}]
            return [{"start": 1.0, "end": 4.0, "text": "Precisamos de três posts"}]

        with (
            mock.patch("plane.bgtasks.meeting_recording_task.to_wav"),
            mock.patch("plane.bgtasks.meeting_recording_task.transcribe_wav", side_effect=fake_transcribe),
            mock.patch(
                "plane.bgtasks.meeting_recording_task.mix_tracks",
                side_effect=lambda a, b, dst: open(dst, "wb").write(b"MIX"),
            ),
        ):
            task.transcribe_meeting(str(recording.id))
        recording.refresh_from_db()
        assert recording.status == MeetingRecording.Status.READY
        assert recording.created_by_id == create_user.id
        assert [s["speaker"] for s in recording.transcript] == ["others", "recorder"]
        assert "[00:05] Giuliano: Combinado então" in recording.transcript_text
        assert recording.summary_status == MeetingRecording.SummaryStatus.NONE
        assert set(recording.audio_keys) == {"mic", "tab", "mix"}
        assert FakeStorage.objects[recording.audio_key("mix")] == b"MIX"
        assert FakeStorage.objects[recording.audio_key("mic")] == b"AABB"
        assert not any("/mic/" in key or "/tab/" in key for key in FakeStorage.objects)

    @override_settings(MEETING_SUMMARY_ENGINE="ollama", OLLAMA_URL="http://ollama:11434")
    def test_local_draft_of_the_minutes(self, issue, create_user):
        create_user.display_name = "Giuliano"
        create_user.save()
        recording = self._recording(issue, create_user, status=MeetingRecording.Status.QUEUED, tab_chunks=1)
        FakeStorage.objects[recording.part_key("tab", 0)] = b"CC"
        answer = {
            "resumo": "Reunião de alinhamento.",
            "pauta": ["Campanha"],
            "decisoes": [],
            "proximos_passos": [{"tarefa": "Roteiro", "responsavel": "Giuliano", "prazo": "2026-11-10"}],
            "pendencias": [],
        }
        response = mock.Mock(status_code=200)
        response.json.return_value = {"response": json.dumps(answer)}
        with (
            mock.patch("plane.bgtasks.meeting_recording_task.to_wav"),
            mock.patch(
                "plane.bgtasks.meeting_recording_task.transcribe_wav",
                return_value=[{"start": 0, "end": 2, "text": "oi"}],
            ),
            mock.patch("plane.utils.meeting_summary.requests.post", return_value=response) as post,
        ):
            task.transcribe_meeting(str(recording.id))
        recording.refresh_from_db()
        assert post.call_args.kwargs["json"]["format"] == "json"
        assert recording.summary_status == MeetingRecording.SummaryStatus.DRAFT
        assert recording.summary_source == "ollama"
        assert recording.summary["proximos_passos"][0]["responsavel_id"] == str(create_user.id)

    def test_failure_is_kept_for_retry(self, issue, create_user):
        recording = self._recording(issue, create_user, status=MeetingRecording.Status.QUEUED, tab_chunks=1)
        FakeStorage.objects[recording.part_key("tab", 0)] = b"CC"
        with mock.patch("plane.bgtasks.meeting_recording_task.to_wav", side_effect=RuntimeError("ffmpeg falhou")):
            task.transcribe_meeting(str(recording.id))
        recording.refresh_from_db()
        assert recording.status == MeetingRecording.Status.FAILED
        assert "ffmpeg" in recording.error
        assert recording.audio_keys.get("tab")

    def test_housekeeping(self, issue, create_user, django_capture_on_commit_callbacks):
        stale = timezone.now() - timedelta(hours=1)
        abandoned = self._recording(issue, create_user, mic_chunks=3, last_chunk_at=stale)
        empty = self._recording(issue, create_user)
        MeetingRecording.objects.filter(pk=empty.pk).update(started_at=stale)
        old = self._recording(issue, create_user, status=MeetingRecording.Status.READY)
        MeetingRecording.objects.filter(pk=old.pk).update(
            started_at=timezone.now() - timedelta(days=400), audio_keys={"tab": old.audio_key("tab")}
        )
        FakeStorage.objects[old.audio_key("tab")] = b"audio"
        with (
            mock.patch.object(task.transcribe_meeting, "apply_async"),
            django_capture_on_commit_callbacks(execute=True),
        ):
            result = task.meeting_recordings_housekeeping()
        assert result == {"finished": 2, "purged_audio": 1}
        abandoned.refresh_from_db()
        assert abandoned.status == MeetingRecording.Status.QUEUED
        assert abandoned.created_by_id == create_user.id
        assert not MeetingRecording.objects.filter(pk=empty.pk).exists()
        old.refresh_from_db()
        assert old.audio_keys == {} and old.audio_deleted_at is not None
        assert not FakeStorage.objects


def _next_weekday(days_ahead=2):
    day = timezone.now().astimezone(SP).date() + timedelta(days=days_ahead)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


@pytest.mark.contract
@pytest.mark.django_db
class TestMeetingBooking:
    @pytest.fixture
    def host(self, create_user):
        connection = GoogleCalendarConnection(user=create_user, google_email="me@gmail.com")
        connection.access_token = "access"
        connection.refresh_token = "refresh"
        connection.save()
        return create_user

    def _enable(self, project, host):
        project.meeting_booking = booking.clean_booking(
            {"enabled": True, "host_ids": [str(host.id)], "duration_minutes": 60}, [host.id]
        )
        project.save()

    def test_settings_are_validated(self, session_client, workspace, project, create_user):
        url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/"
        bad = session_client.patch(url, {"meeting_booking": {"enabled": True, "host_ids": []}}, format="json")
        assert bad.status_code == status.HTTP_400_BAD_REQUEST
        ok = session_client.patch(
            url,
            {"meeting_booking": {"enabled": True, "host_ids": [str(create_user.id)], "day_start": "10:00"}},
            format="json",
        )
        assert ok.status_code == status.HTTP_200_OK
        project.refresh_from_db()
        assert project.meeting_booking["day_start"] == "10:00"
        assert project.meeting_booking["duration_minutes"] == 30

    def test_rules_and_busy_times(self):
        config = {**booking.DEFAULTS, "enabled": True, "duration_minutes": 60, "notice_hours": 0}
        day = date(2026, 11, 9)  # segunda
        now = datetime.combine(day, time(8, 0), tzinfo=SP)
        slots = booking.candidate_slots(config, SP, day, 1, now)
        assert slots[0][0].hour == 9 and slots[-1][1].hour == 18
        busy = [(datetime.combine(day, time(10, 0), tzinfo=SP).isoformat(), "2026-11-09T11:00:00-03:00")]
        free = booking.free_slots(slots, busy)
        assert all(not (start.hour == 10 or (start.hour == 9 and start.minute == 30)) for start, _end in free)
        sunday = booking.candidate_slots(config, SP, date(2026, 11, 8), 1, now)
        assert sunday == []

    def test_client_sees_free_slots_and_books(self, workspace, project, issue, host):
        self._enable(project, host)
        guest, guest_user = _client(workspace, project, 5, "cliente@plane.so", display_name="Ana")
        day = _next_weekday()
        busy = [(f"{day}T09:00:00-03:00", f"{day}T12:00:00-03:00")]
        with (
            mock.patch("plane.utils.google_calendar.get_valid_access_token", return_value="access"),
            mock.patch("plane.utils.google_calendar.free_busy", return_value=busy),
        ):
            slots = guest.get(_url("issue-meeting-slots", issue), {"from": day.isoformat(), "days": 1})
        assert slots.status_code == status.HTTP_200_OK
        starts = [s["start"] for s in slots.data["slots"]]
        assert starts and all(datetime.fromisoformat(s).hour >= 12 for s in starts)

        event = {
            "id": "g1",
            "summary": "CLI-1 · Campanha",
            "start": {"dateTime": starts[0]},
            "end": {"dateTime": slots.data["slots"][0]["end"]},
            "htmlLink": "https://calendar.google.com/e",
            "hangoutLink": "https://meet.google.com/abc-defg-hij",
            "attendees": [],
        }
        with (
            mock.patch("plane.utils.google_calendar.get_valid_access_token", return_value="access"),
            mock.patch("plane.utils.google_calendar.free_busy", return_value=busy),
            mock.patch("plane.utils.google_calendar.create_event", return_value=event) as create,
            mock.patch("plane.app.views.issue.calendar_event._log_activity"),
        ):
            booked = guest.post(
                _url("issue-meeting-requests", issue), {"start": starts[0], "note": "Sobre a campanha"}, format="json"
            )
            taken = guest.post(_url("issue-meeting-requests", issue), {"start": f"{day}T10:00:00-03:00"}, format="json")
        assert booked.status_code == status.HTTP_201_CREATED
        body = create.call_args[0][2]
        assert "Esta reunião pode ser gravada" in body["description"]
        assert "Pedida por Ana" in body["description"]
        assert {"email": guest_user.email} in body["attendees"]
        row = IssueCalendarEvent.objects.get(google_event_id="g1")
        assert row.created_by_id == host.id
        assert taken.status_code == status.HTTP_409_CONFLICT

    def test_booking_off_or_without_calendar(self, workspace, project, issue, create_user):
        guest, _ = _client(workspace, project, 5, "cliente2@plane.so")
        assert guest.get(_url("issue-meeting-slots", issue)).status_code == status.HTTP_403_FORBIDDEN
        project.meeting_booking = booking.clean_booking(
            {"enabled": True, "host_ids": [str(create_user.id)]}, [create_user.id]
        )
        project.save()
        assert guest.get(_url("issue-meeting-slots", issue)).status_code == status.HTTP_409_CONFLICT
