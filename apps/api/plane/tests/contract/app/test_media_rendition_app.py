# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: conversão dos vídeos da revisão da peça (cópia que toca no navegador, capa e miniaturas),
o limite próprio de upload de vídeo e os endpoints …/media-review/renditions/…"""

import json
import os
import shutil
import subprocess
from types import SimpleNamespace
from unittest import mock

import pytest
from django.conf import settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from plane.bgtasks import media_review_task as task
from plane.db.models import FileAsset, Issue, MediaRendition, Project, ProjectMember, State, User, WorkspaceMember

HAS_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


def _probe(codec="h264", pix_fmt="yuv420p", fmt="mov,mp4,m4a,3gp,3g2,mj2", width=1920, height=1080, **extra):
    video = {"codec_type": "video", "codec_name": codec, "pix_fmt": pix_fmt, "width": width, "height": height}
    video.update({"avg_frame_rate": "25/1", "duration": "12.0"})
    video.update(extra.pop("video", {}))
    streams = [video]
    audio = extra.pop("audio", "aac")
    if audio:
        streams.append({"codec_type": "audio", "codec_name": audio})
    return {"streams": streams, "format": {"format_name": fmt, "duration": "12.0", "bit_rate": extra.get("bit_rate")}}


class TestConversionRules:
    def test_browser_friendly_files_are_kept(self):
        assert not task.needs_playback_copy(task.summarize(_probe()))
        assert not task.needs_playback_copy(task.summarize(_probe("vp9", fmt="matroska,webm", audio="opus")))
        assert not task.needs_playback_copy(task.summarize(_probe(audio=None)))

    @pytest.mark.parametrize(
        "probe",
        [
            _probe("prores", pix_fmt="yuv422p10le"),  # saída de edição
            _probe("hevc"),  # iPhone
            _probe(pix_fmt="yuv422p"),  # H.264 4:2:2 não toca no navegador
            _probe(audio="pcm_s16le"),
            _probe(fmt="avi"),
            _probe(width=3840, height=2160),
            _probe(bit_rate="50000000"),
            _probe("h264", fmt="matroska,webm"),
        ],
    )
    def test_needs_copy(self, probe):
        assert task.needs_playback_copy(task.summarize(probe))

    def test_summary(self):
        info = task.summarize(_probe(video={"side_data_list": [{"rotation": -90}], "avg_frame_rate": "30000/1001"}))
        # gravado em pé: as medidas trocam
        assert (info["width"], info["height"]) == (1080, 1920)
        assert info["fps"] == 29.97
        assert info["duration"] == 12.0
        assert task.summarize({"streams": [{"codec_type": "audio"}]}) == {"has_video": False}
        # capa embutida (mp3/m4a) não conta como vídeo
        cover = {"streams": [{"codec_type": "video", "disposition": {"attached_pic": 1}}]}
        assert task.summarize(cover) == {"has_video": False}

    def test_sprite_plan(self):
        assert task.sprite_plan(30, 1920, 1080) == {
            "interval": 1.0,
            "count": 30,
            "columns": 10,
            "rows": 3,
            "tile_width": 160,
            "tile_height": 90,
        }
        plan = task.sprite_plan(1000, 1080, 1920)
        assert (plan["interval"], plan["count"], plan["rows"], plan["tile_height"]) == (10.0, 100, 10, 284)
        assert task.sprite_plan(0, 1920, 1080) is None
        assert task.sprite_plan(3.5, 640, 360)["count"] == 4


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Render", identifier="RND", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def issue(db, project, create_user):
    state = State.objects.create(name="Todo", group="unstarted", project=project, workspace=project.workspace)
    return Issue.objects.create(name="Vídeo", project=project, workspace=project.workspace, state=state)


def _asset(issue, name="peca.mp4", mime="video/mp4", uploaded=True):
    return FileAsset.objects.create(
        asset=f"{issue.workspace_id}/{name}",
        attributes={"name": name, "type": mime, "size": 1000},
        workspace=issue.workspace,
        project=issue.project,
        issue=issue,
        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
        is_uploaded=uploaded,
    )


def _url(name, issue, **kwargs):
    return reverse(
        name, kwargs={"slug": issue.workspace.slug, "project_id": issue.project_id, "issue_id": issue.id, **kwargs}
    )


def _attachments_url(issue):
    return (
        f"/api/assets/v2/workspaces/{issue.workspace.slug}/projects/{issue.project_id}/issues/{issue.id}/attachments/"
    )


def _client(workspace, project, role, email):
    user = User.objects.create(email=email, username=email.split("@")[0])
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    ProjectMember.objects.create(project=project, member=user, role=role, is_active=True)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.contract
class TestUploadAndQueue:
    def test_video_upload_uses_video_limit(self, session_client, issue):
        url = _attachments_url(issue)
        big = settings.FILE_SIZE_LIMIT * 20
        with mock.patch("plane.app.views.issue.attachment.S3Storage") as storage:
            storage.return_value.generate_presigned_post.return_value = {"url": "x", "fields": {}}
            video = session_client.post(
                url, {"name": "peca.mov", "type": "video/quicktime", "size": big}, format="json"
            )
            image = session_client.post(url, {"name": "arte.png", "type": "image/png", "size": big}, format="json")
        assert video.status_code == status.HTTP_200_OK, video.data
        assert FileAsset.objects.get(pk=video.data["asset_id"]).size == min(big, settings.VIDEO_FILE_SIZE_LIMIT)
        assert FileAsset.objects.get(pk=image.data["asset_id"]).size == settings.FILE_SIZE_LIMIT

    def test_finishing_a_video_upload_queues_conversion(
        self, session_client, issue, django_capture_on_commit_callbacks
    ):
        video = _asset(issue, uploaded=False)
        image = _asset(issue, name="arte.png", mime="image/png", uploaded=False)
        with (
            mock.patch.object(task.process_media_asset, "apply_async") as apply_async,
            mock.patch("plane.app.views.issue.attachment.get_asset_object_metadata"),
            mock.patch("plane.app.views.issue.attachment.issue_activity"),
            django_capture_on_commit_callbacks(execute=True),
        ):
            for asset in (video, image):
                url = f"{_attachments_url(issue)}{asset.id}/"
                assert session_client.patch(url, {}, format="json").status_code == status.HTTP_204_NO_CONTENT
        assert MediaRendition.objects.get(pk=video.id).status == "pending"
        assert not MediaRendition.objects.filter(pk=image.id).exists()
        apply_async.assert_called_once_with(args=[str(video.id)], queue="media")

    def test_list_queues_old_videos_and_skips_images(self, session_client, issue):
        video = _asset(issue)
        _asset(issue, name="arte.png", mime="image/png")
        with mock.patch.object(task.process_media_asset, "apply_async"):
            response = session_client.get(_url("project-issue-media-renditions", issue))
        assert response.status_code == status.HTTP_200_OK
        assert [item["asset"] for item in response.data] == [str(video.id)]
        assert response.data[0]["status"] == "pending"
        assert response.data[0]["sprite"] is None

    def test_file_redirect(self, session_client, issue):
        video = _asset(issue)
        MediaRendition.objects.create(asset=video, status="ready", poster_key="media-review/x/poster.jpg")
        poster = _url("project-issue-media-rendition-file", issue, asset_id=video.id, kind="poster")
        playback = _url("project-issue-media-rendition-file", issue, asset_id=video.id, kind="playback")
        other = _url("project-issue-media-rendition-file", issue, asset_id=video.id, kind="original")
        with mock.patch("plane.app.views.issue.media_review.S3Storage") as storage:
            storage.return_value.generate_presigned_url.return_value = "https://example.test/poster.jpg"
            response = session_client.get(poster)
            assert response.status_code == status.HTTP_302_FOUND
            assert response["Location"] == "https://example.test/poster.jpg"
            assert storage.return_value.generate_presigned_url.call_args.kwargs["content_type"] == "image/jpeg"
            # sem cópia de reprodução (o original já servia) e tipo desconhecido: 404
            assert session_client.get(playback).status_code == status.HTTP_404_NOT_FOUND
            assert session_client.get(other).status_code == status.HTTP_404_NOT_FOUND

    def test_retry_is_for_the_team(self, session_client, issue, workspace, project, django_capture_on_commit_callbacks):
        video = _asset(issue)
        MediaRendition.objects.create(asset=video, status="failed", error="ffmpeg falhou")
        url = _url("project-issue-media-rendition-retry", issue, asset_id=video.id)
        guest = _client(workspace, project, 5, "cliente-render@plane.so")
        assert guest.post(url).status_code == status.HTTP_403_FORBIDDEN
        with (
            mock.patch.object(task.process_media_asset, "apply_async") as apply_async,
            django_capture_on_commit_callbacks(execute=True),
        ):
            response = session_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "pending" and response.data["error"] == ""
        assert apply_async.called


def _make_video(path, codec_args, seconds=3):
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25"]
        + ["-f", "lavfi", "-i", "sine=frequency=440", "-t", str(seconds), "-shortest"]
        + codec_args
        + [path],
        check=True,
    )


@pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg não instalado")
@pytest.mark.contract
class TestProcessing:
    def _run(self, issue, tmp_path, filename, codec_args):
        source = tmp_path / filename
        _make_video(str(source), codec_args)
        asset = _asset(issue, name=filename, mime="video/x-msvideo")
        MediaRendition.objects.create(asset=asset)
        uploaded = {}

        def upload_file(handle, key, content_type=None, extra_args=None):
            target = tmp_path / key.replace("/", "_")
            target.write_bytes(handle.read())
            uploaded[key] = (str(target), content_type)
            return True

        fake = SimpleNamespace(
            aws_storage_bucket_name="uploads",
            s3_client=SimpleNamespace(download_file=lambda bucket, key, dest: shutil.copy(source, dest)),
            upload_file=upload_file,
        )
        with mock.patch.object(task, "S3Storage", return_value=fake):
            task.process_media_asset(str(asset.id))
        return MediaRendition.objects.get(pk=asset.id), uploaded

    def test_old_codec_gets_a_playback_copy(self, issue, tmp_path):
        rendition, uploaded = self._run(issue, tmp_path, "peca.avi", ["-c:v", "mpeg4", "-c:a", "mp3"])
        assert rendition.status == "ready", rendition.error
        prefix = f"media-review/{rendition.asset_id}/"
        assert rendition.playback_key == f"{prefix}playback.mp4"
        assert set(uploaded) == {f"{prefix}playback.mp4", f"{prefix}poster.jpg", f"{prefix}sprite.jpg"}
        assert uploaded[f"{prefix}playback.mp4"][1] == "video/mp4"
        probe = json.loads(
            subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-print_format",
                    "json",
                    "-show_streams",
                    uploaded[rendition.playback_key][0],
                ],
                capture_output=True,
                text=True,
                check=True,
            ).stdout
        )
        codecs = {stream["codec_type"]: stream["codec_name"] for stream in probe["streams"]}
        assert codecs == {"video": "h264", "audio": "aac"}
        assert (rendition.width, rendition.height, rendition.fps) == (320, 240, 25.0)
        assert rendition.sprite == task.sprite_plan(rendition.duration, 320, 240)
        assert rendition.attempts == 1

    def test_browser_friendly_video_keeps_the_original(self, issue, tmp_path):
        rendition, uploaded = self._run(
            issue, tmp_path, "peca.mp4", ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"]
        )
        assert rendition.status == "ready", rendition.error
        assert rendition.playback_key == ""
        assert os.path.basename(sorted(uploaded)[0]) == "poster.jpg"
        assert rendition.sprite_key.endswith("sprite.jpg")

    def test_broken_file_fails_with_message(self, issue, tmp_path):
        source = tmp_path / "quebrado.mp4"
        source.write_bytes(b"isto nao e um video")
        asset = _asset(issue, name="quebrado.mp4")
        MediaRendition.objects.create(asset=asset)
        fake = SimpleNamespace(
            aws_storage_bucket_name="uploads",
            s3_client=SimpleNamespace(download_file=lambda bucket, key, dest: shutil.copy(source, dest)),
            upload_file=lambda *args, **kwargs: True,
        )
        with mock.patch.object(task, "S3Storage", return_value=fake), mock.patch.object(task, "log_exception"):
            task.process_media_asset(str(asset.id))
        rendition = MediaRendition.objects.get(pk=asset.id)
        assert rendition.status == "failed"
        assert "ffprobe" in rendition.error

    def test_deleting_the_rendition_removes_its_files(self, issue, django_capture_on_commit_callbacks):
        asset = _asset(issue)
        rendition = MediaRendition.objects.create(asset=asset, poster_key="a/poster.jpg", sprite_key="a/sprite.jpg")
        with (
            mock.patch.object(task.delete_rendition_files, "delay") as delay,
            django_capture_on_commit_callbacks(execute=True),
        ):
            rendition.delete()
        delay.assert_called_once_with(["a/poster.jpg", "a/sprite.jpg"])
