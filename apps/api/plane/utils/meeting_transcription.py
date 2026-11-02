# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: transcrição local das reuniões (faster-whisper em CPU) e a junção das duas faixas.

O modelo fica carregado no processo do worker (``plane-transcriber``) entre uma reunião e outra. O
faster-whisper só é importado aqui dentro, para a API e os outros workers não precisarem dele."""

# Python imports
import difflib
import re
import shutil
import subprocess

# Django imports
from django.conf import settings

_MODEL = None
_MODEL_NAME = None


class TranscriptionError(Exception):
    pass


def to_wav(src, dst, timeout=3600):
    """Áudio mono de 16 kHz, o formato que o Whisper usa (o ffmpeg já está na imagem da API)."""
    prefix = ["nice", "-n", "10"] if shutil.which("nice") else []
    command = prefix + ["ffmpeg", "-y", "-v", "error", "-i", src, "-ac", "1", "-ar", "16000", "-f", "wav", dst]
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        tail = (result.stderr or "").strip().splitlines()[-3:]
        raise TranscriptionError("ffmpeg falhou: " + " | ".join(tail))


def mix_tracks(first, second, dst, timeout=3600):
    """As duas faixas num arquivo só, para ouvir a reunião como ela foi (Opus, voz, 32 kbps)."""
    prefix = ["nice", "-n", "10"] if shutil.which("nice") else []
    command = prefix + [
        "ffmpeg", "-y", "-v", "error", "-i", first, "-i", second,
        "-filter_complex", "amix=inputs=2:duration=longest:normalize=0",
        "-ac", "1", "-c:a", "libopus", "-b:a", "32k", "-f", "webm", dst,
    ]  # fmt: skip
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        tail = (result.stderr or "").strip().splitlines()[-3:]
        raise TranscriptionError("ffmpeg (mistura) falhou: " + " | ".join(tail))


def _model():
    global _MODEL, _MODEL_NAME
    if _MODEL is None or _MODEL_NAME != settings.TRANSCRIBE_MODEL:
        from faster_whisper import WhisperModel  # noqa: PLC0415 (só no worker de transcrição)

        _MODEL = WhisperModel(
            settings.TRANSCRIBE_MODEL,
            device="cpu",
            compute_type="int8",
            cpu_threads=settings.TRANSCRIBE_THREADS,
            download_root=settings.TRANSCRIBE_MODEL_DIR,
        )
        _MODEL_NAME = settings.TRANSCRIBE_MODEL
    return _MODEL


def transcribe_wav(path):
    """[{"start", "end", "text"}] de um arquivo de áudio. Trechos de silêncio são pulados (VAD)."""
    segments, _info = _model().transcribe(
        path, language=settings.TRANSCRIBE_LANGUAGE or None, vad_filter=True, beam_size=5
    )
    result = []
    for segment in segments:
        text = (segment.text or "").strip()
        if text:
            result.append({"start": round(segment.start, 2), "end": round(segment.end, 2), "text": text})
    return result


def _normalized(text):
    return re.sub(r"[^\w ]+", "", text.lower()).strip()


def _is_echo(mic, tab_segments):
    """Sem fone, o microfone capta a voz dos outros saindo da caixa de som: a fala aparece nas duas faixas.
    Um trecho do microfone que repete um trecho da aba no mesmo momento é eco e sai."""
    mic_text = _normalized(mic["text"])
    if not mic_text:
        return True
    for tab in tab_segments:
        if tab["end"] < mic["start"] - 2 or tab["start"] > mic["end"] + 2:
            continue
        if difflib.SequenceMatcher(None, mic_text, _normalized(tab["text"])).ratio() >= 0.6:
            return True
    return False


def merge_tracks(mic_segments, tab_segments):
    """Uma conversa só, em ordem de tempo: "recorder" (quem gravou) e "others" (os outros participantes)."""
    merged = [{**segment, "speaker": "others"} for segment in tab_segments]
    merged += [{**segment, "speaker": "recorder"} for segment in mic_segments if not _is_echo(segment, tab_segments)]
    merged.sort(key=lambda segment: (segment["start"], segment["end"]))
    return merged


def transcript_text(segments, recorder_name):
    """Texto corrido (para a busca e para o resumo), com o tempo e quem falou."""
    lines = []
    for segment in segments:
        minutes, seconds = divmod(int(segment["start"]), 60)
        who = recorder_name if segment["speaker"] == "recorder" else "Participantes"
        lines.append(f"[{minutes:02d}:{seconds:02d}] {who}: {segment['text']}")
    return "\n".join(lines)
