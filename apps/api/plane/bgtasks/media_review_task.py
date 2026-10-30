# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: conversão dos vídeos anexados para a revisão da peça (o que o Clapshot fazia).

Para cada vídeo: lê o arquivo com o ffprobe, faz uma cópia em MP4 (H.264/AAC, até 1080p) quando o
original não toca bem no navegador, e gera um quadro de capa e uma grade de miniaturas para a linha do
tempo. Roda na fila ``media``, num worker só para isso (``celery -A plane worker -Q media
--concurrency=1``), para um vídeo grande não segurar as notificações e os webhooks da fila padrão.
"""

# Python imports
import json
import math
import os
import shutil
import subprocess
import tempfile
from datetime import timedelta

# Django imports
from django.db import transaction
from django.utils import timezone

# Third party imports
from celery import shared_task

# Module imports
from plane.db.models import MediaRendition
from plane.settings.storage import S3Storage
from plane.utils.exception_logger import log_exception

MEDIA_QUEUE = "media"
FFMPEG_THREADS = int(os.environ.get("MEDIA_FFMPEG_THREADS", "2"))
# Um vídeo longo em 1080p leva minutos; o limite só existe para um arquivo estragado não prender o worker.
TRANSCODE_TIMEOUT = int(os.environ.get("MEDIA_TRANSCODE_TIMEOUT", str(4 * 3600)))
TMP_DIR = os.environ.get("MEDIA_TMP_DIR") or None
# Um "processing" mais velho que isso é de um worker que caiu no meio: pode tentar de novo.
STALE_PROCESSING = timedelta(hours=5)

BROWSER_VIDEO_CODECS = {"h264", "vp8", "vp9", "av1"}
BROWSER_AUDIO_CODECS = {"aac", "mp3", "opus", "vorbis"}
BROWSER_PIX_FMTS = {"yuv420p", "yuvj420p"}
MAX_PLAYBACK_HEIGHT = 1080
MAX_PLAYBACK_BITRATE = 20_000_000
SPRITE_MAX_TILES = 100
SPRITE_COLUMNS = 10
SPRITE_TILE_WIDTH = 160


class MediaError(Exception):
    pass


def is_video_asset(asset):
    return (asset.attributes or {}).get("type", "").startswith("video/")


def _rate(value):
    try:
        num, den = str(value).split("/")
        return float(num) / float(den) if float(den) else None
    except (ValueError, ZeroDivisionError):
        return None


def _rotation(stream):
    for item in stream.get("side_data_list") or []:
        if "rotation" in item:
            return int(float(item["rotation"]))
    rotate = (stream.get("tags") or {}).get("rotate")
    return int(float(rotate)) if rotate else 0


def summarize(probe):
    """Resume a saída do ``ffprobe -show_streams -show_format`` no que a conversão precisa."""
    streams = probe.get("streams") or []
    video = next(
        (s for s in streams if s.get("codec_type") == "video" and not (s.get("disposition") or {}).get("attached_pic")),
        None,
    )
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    fmt = probe.get("format") or {}
    if not video:
        return {"has_video": False}
    width, height = int(video.get("width") or 0), int(video.get("height") or 0)
    # vídeo de celular gravado em pé: o arquivo diz 1920x1080 e manda girar 90°
    if abs(_rotation(video)) % 180 == 90:
        width, height = height, width
    fps = _rate(video.get("avg_frame_rate")) or _rate(video.get("r_frame_rate"))
    duration = video.get("duration") or fmt.get("duration")
    bit_rate = fmt.get("bit_rate") or video.get("bit_rate")
    return {
        "has_video": True,
        "width": width,
        "height": height,
        "fps": round(fps, 3) if fps and 1 <= fps <= 240 else None,
        "duration": float(duration) if duration else None,
        "video_codec": video.get("codec_name") or "",
        "pix_fmt": video.get("pix_fmt") or "",
        "audio_codec": audio.get("codec_name") if audio else None,
        "format_name": fmt.get("format_name") or "",
        "bit_rate": int(bit_rate) if bit_rate else None,
    }


def needs_playback_copy(info):
    """O original toca em qualquer navegador (Chrome, Safari, Firefox) e é leve o bastante?"""
    container = info["format_name"]
    if not any(name in container for name in ("mp4", "mov", "webm")):
        return True
    if info["video_codec"] not in BROWSER_VIDEO_CODECS or info["pix_fmt"] not in BROWSER_PIX_FMTS:
        return True
    if info["audio_codec"] and info["audio_codec"] not in BROWSER_AUDIO_CODECS:
        return True
    if "webm" in container and info["video_codec"] == "h264":
        return True
    if min(info["width"], info["height"]) > MAX_PLAYBACK_HEIGHT:
        return True
    return bool(info["bit_rate"] and info["bit_rate"] > MAX_PLAYBACK_BITRATE)


def transcode_command(src, dst, info):
    gop = max(12, int(round((info.get("fps") or 25) * 2)))
    # o lado menor vai a no máximo 1080, com as duas medidas pares (exigência do H.264)
    portrait = info["height"] > info["width"]
    scale = "scale='trunc(min(1080,iw)/2)*2':-2" if portrait else "scale=-2:'trunc(min(1080,ih)/2)*2'"
    return [
        "ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", src,
        "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn",
        "-vf", f"{scale},format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-profile:v", "high",
        "-g", str(gop), "-threads", str(FFMPEG_THREADS),
        "-c:a", "aac", "-b:a", "160k", "-ac", "2",
        "-movflags", "+faststart", dst,
    ]  # fmt: skip


def poster_command(src, dst, duration):
    at = min(1.0, (duration or 0) * 0.1)
    return [
        "ffmpeg", "-hide_banner", "-nostdin", "-y", "-ss", f"{at:.3f}", "-i", src,
        "-frames:v", "1", "-vf", "scale=-2:'trunc(min(720,ih)/2)*2'", "-q:v", "3", dst,
    ]  # fmt: skip


def sprite_plan(duration, width, height):
    """Grade de até 100 miniaturas, uma a cada ``interval`` segundos (no mínimo 1 s)."""
    if not duration or duration <= 0 or not width or not height:
        return None
    interval = max(1.0, round(duration / SPRITE_MAX_TILES, 2))
    count = max(1, min(SPRITE_MAX_TILES, math.ceil(duration / interval)))
    columns = min(SPRITE_COLUMNS, count)
    rows = math.ceil(count / columns)
    tile_height = max(2, int(round(SPRITE_TILE_WIDTH * height / width / 2)) * 2)
    return {
        "interval": interval,
        "count": count,
        "columns": columns,
        "rows": rows,
        "tile_width": SPRITE_TILE_WIDTH,
        "tile_height": tile_height,
    }


def sprite_command(src, dst, plan, keyframes_only=False):
    # Na cópia de reprodução (um quadro-chave a cada 2 s) basta ler os quadros-chave, o que é bem mais
    # rápido. No original não dá: há vídeos com um quadro-chave só, e a grade sairia vazia.
    skip = ["-skip_frame", "nokey"] if keyframes_only else []
    return [
        "ffmpeg", "-hide_banner", "-nostdin", "-y", *skip, "-i", src,
        "-vf",
        f"fps=1/{plan['interval']},scale={plan['tile_width']}:{plan['tile_height']},"
        f"tile={plan['columns']}x{plan['rows']}",
        "-frames:v", "1", "-q:v", "4", "-threads", str(FFMPEG_THREADS), dst,
    ]  # fmt: skip


def _run(command, timeout):
    # nice: a conversão cede a CPU para a API e os outros serviços da VPS
    prefix = ["nice", "-n", "10"] if shutil.which("nice") else []
    result = subprocess.run(prefix + command, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        tail = (result.stderr or "").strip().splitlines()[-5:]
        raise MediaError(f"{command[0]} falhou: " + " | ".join(tail))
    return result.stdout


def probe_file(path):
    output = _run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path], timeout=300
    )
    return json.loads(output or "{}")


def rendition_prefix(asset_id):
    return f"media-review/{asset_id}/"


def queue_media_processing(asset):
    """Cria (ou reabre) a conversão de um vídeo anexado e manda para a fila, depois do commit."""
    if not is_video_asset(asset) or not asset.is_uploaded:
        return None
    rendition, created = MediaRendition.objects.get_or_create(asset=asset)
    if not created and rendition.status != MediaRendition.Status.FAILED:
        return rendition
    if not created:
        rendition.status = MediaRendition.Status.PENDING
        rendition.error = ""
        rendition.save(update_fields=["status", "error", "updated_at"])
    asset_id = str(asset.id)
    transaction.on_commit(lambda: process_media_asset.apply_async(args=[asset_id], queue=MEDIA_QUEUE))
    return rendition


def _upload(storage, path, key, content_type):
    with open(path, "rb") as handle:
        if not storage.upload_file(handle, key, content_type=content_type, extra_args={}):
            raise MediaError(f"não foi possível gravar {key}")


@shared_task(acks_late=True, time_limit=TRANSCODE_TIMEOUT + 1800)
def process_media_asset(asset_id):
    rendition = MediaRendition.objects.filter(pk=asset_id).select_related("asset").first()
    if not rendition or rendition.status == MediaRendition.Status.READY:
        return
    if (
        rendition.status == MediaRendition.Status.PROCESSING
        and timezone.now() - rendition.updated_at < STALE_PROCESSING
    ):
        return
    asset = rendition.asset
    if asset.is_deleted or asset.deleted_at:
        rendition.delete()
        return

    rendition.status = MediaRendition.Status.PROCESSING
    rendition.attempts += 1
    rendition.error = ""
    rendition.save(update_fields=["status", "attempts", "error", "updated_at"])

    storage = S3Storage()
    prefix = rendition_prefix(asset.id)
    try:
        with tempfile.TemporaryDirectory(prefix="media-review-", dir=TMP_DIR) as tmp:
            original = os.path.join(tmp, "original")
            storage.s3_client.download_file(storage.aws_storage_bucket_name, asset.asset.name, original)
            info = summarize(probe_file(original))
            if not info.get("has_video"):
                raise MediaError("o arquivo não tem vídeo")

            source = original
            playback_key = ""
            if needs_playback_copy(info):
                playback = os.path.join(tmp, "playback.mp4")
                _run(transcode_command(original, playback, info), timeout=TRANSCODE_TIMEOUT)
                os.remove(original)  # libera o disco antes das miniaturas
                playback_key = f"{prefix}playback.mp4"
                _upload(storage, playback, playback_key, "video/mp4")
                source = playback
                info = {**info, **{k: v for k, v in summarize(probe_file(playback)).items() if v}}

            poster_key = ""
            poster = os.path.join(tmp, "poster.jpg")
            _run(poster_command(source, poster, info["duration"]), timeout=600)
            poster_key = f"{prefix}poster.jpg"
            _upload(storage, poster, poster_key, "image/jpeg")

            # As miniaturas são um extra: sem elas a linha do tempo só não mostra a prévia.
            sprite_key, plan = "", sprite_plan(info["duration"], info["width"], info["height"])
            if plan:
                sprite = os.path.join(tmp, "sprite.jpg")
                _run(sprite_command(source, sprite, plan, keyframes_only=bool(playback_key)), timeout=TRANSCODE_TIMEOUT)
                if os.path.exists(sprite):
                    sprite_key = f"{prefix}sprite.jpg"
                    _upload(storage, sprite, sprite_key, "image/jpeg")
                else:
                    plan = None

        rendition.status = MediaRendition.Status.READY
        rendition.duration = info["duration"]
        rendition.width = info["width"]
        rendition.height = info["height"]
        rendition.fps = info["fps"]
        rendition.video_codec = info["video_codec"]
        rendition.playback_key = playback_key
        rendition.poster_key = poster_key
        rendition.sprite_key = sprite_key
        rendition.sprite = plan or {}
        rendition.save()
    except Exception as error:  # noqa: BLE001 — qualquer falha vira "não foi possível converter" na tela
        log_exception(error)
        rendition.status = MediaRendition.Status.FAILED
        rendition.error = str(error)[:2000]
        rendition.save(update_fields=["status", "error", "updated_at"])


@shared_task
def delete_rendition_files(keys):
    keys = [key for key in keys if key]
    if keys:
        S3Storage().delete_files(keys)
