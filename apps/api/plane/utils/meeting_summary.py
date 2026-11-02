# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: a ata das reuniões. Estrutura, limpeza do que chega da tela e o rascunho automático opcional.

``MEETING_SUMMARY_ENGINE``:
- ``none`` (padrão): a equipe escreve a ata, com a transcrição ao lado;
- ``ollama``: um modelo local (``OLLAMA_MODEL``) faz o rascunho, que a equipe revisa antes de publicar."""

# Python imports
import html
import json
import uuid
from datetime import date

# Django imports
from django.conf import settings

# Third party imports
import requests

LIST_FIELDS = ("pauta", "decisoes", "pendencias")
MAX_ITEMS = 50
MAX_TEXT = 5000
MAX_LINE = 1000

PROMPT = (
    "Você recebe a transcrição de uma reunião de uma agência de marketing (Pespo), com o tempo e quem falou em "
    "cada linha. O item de trabalho da reunião é: {issue}. As pessoas da equipe são: {team}.\n"
    "Responda só com um JSON com as chaves: resumo (3 a 5 frases), pauta (lista de tópicos), decisoes (lista), "
    "proximos_passos (lista de objetos com tarefa, responsavel e prazo no formato AAAA-MM-DD; use null quando "
    "não foi dito) e pendencias (lista). Escreva em português do Brasil e não invente nada que não esteja na "
    "transcrição.\n\nTRANSCRIÇÃO:\n{transcript}"
)


class SummaryError(Exception):
    pass


def empty_summary():
    return {"resumo": "", "pauta": [], "decisoes": [], "proximos_passos": [], "pendencias": []}


def _line(value, limit=MAX_LINE):
    return str(value or "").strip()[:limit]


def _uuid_or_none(value):
    try:
        return str(uuid.UUID(str(value))) if value else None
    except ValueError:
        return None


def _date_or_none(value):
    try:
        return date.fromisoformat(str(value)).isoformat() if value else None
    except ValueError:
        return None


def clean_summary(data, member_ids=()):
    """A ata no formato certo, com limites. ``responsavel_id`` só fica se for membro do projeto."""
    if not isinstance(data, dict):
        raise ValueError("summary must be an object")
    summary = empty_summary()
    summary["resumo"] = _line(data.get("resumo"), MAX_TEXT)
    for field in LIST_FIELDS:
        items = data.get(field) or []
        if not isinstance(items, list):
            raise ValueError(f"{field} must be a list")
        summary[field] = [_line(item) for item in items[:MAX_ITEMS] if _line(item)]
    steps = data.get("proximos_passos") or []
    if not isinstance(steps, list):
        raise ValueError("proximos_passos must be a list")
    members = {str(member_id) for member_id in member_ids}
    for step in steps[:MAX_ITEMS]:
        if isinstance(step, str):
            step = {"tarefa": step}
        if not isinstance(step, dict) or not _line(step.get("tarefa")):
            continue
        responsavel_id = _uuid_or_none(step.get("responsavel_id"))
        summary["proximos_passos"].append(
            {
                "tarefa": _line(step.get("tarefa")),
                "responsavel_id": responsavel_id if responsavel_id in members else None,
                "responsavel": _line(step.get("responsavel"), 200) or None,
                "prazo": _date_or_none(step.get("prazo")),
                "subtask_id": _uuid_or_none(step.get("subtask_id")),
            }
        )
    return summary


def match_member(name, members):
    """O id do membro cujo nome bate com o que o resumo disse (nome de exibição, primeiro nome ou nome todo)."""
    wanted = (name or "").strip().lower()
    if not wanted:
        return None
    for member in members:
        names = {
            (member.display_name or "").lower(),
            (member.first_name or "").lower(),
            f"{member.first_name or ''} {member.last_name or ''}".strip().lower(),
        }
        if wanted in names - {""}:
            return str(member.id)
    return None


def summary_html(summary, title, when):
    """O comentário publicado no item."""
    parts = [f"<p><strong>Ata da reunião</strong>: {html.escape(title)} ({html.escape(when)})</p>"]
    if summary.get("resumo"):
        parts.append(f"<p>{html.escape(summary['resumo'])}</p>")
    sections = (("pauta", "Pauta"), ("decisoes", "Decisões"), ("pendencias", "Pendências"))
    for field, label in sections[:2]:
        if summary.get(field):
            items = "".join(f"<li><p>{html.escape(item)}</p></li>" for item in summary[field])
            parts.append(f"<p><strong>{label}</strong></p><ul>{items}</ul>")
    if summary.get("proximos_passos"):
        items = []
        for step in summary["proximos_passos"]:
            extra = []
            if step.get("responsavel"):
                extra.append(html.escape(step["responsavel"]))
            if step.get("prazo"):
                extra.append(f"até {date.fromisoformat(step['prazo']).strftime('%d/%m/%Y')}")
            suffix = f" ({', '.join(extra)})" if extra else ""
            items.append(f"<li><p>{html.escape(step['tarefa'])}{suffix}</p></li>")
        parts.append(f"<p><strong>Próximos passos</strong></p><ul>{''.join(items)}</ul>")
    if summary.get("pendencias"):
        items = "".join(f"<li><p>{html.escape(item)}</p></li>" for item in summary["pendencias"])
        parts.append(f"<p><strong>{sections[2][1]}</strong></p><ul>{items}</ul>")
    return "".join(parts)


def draft_summary(transcript, issue_name, members):
    """O rascunho automático da ata, ou ``None`` quando não há motor configurado."""
    engine = (settings.MEETING_SUMMARY_ENGINE or "none").lower()
    if engine == "none" or not transcript.strip():
        return None
    if engine != "ollama":
        raise SummaryError(f"motor de resumo desconhecido: {engine}")
    team = ", ".join(sorted({m.display_name or m.first_name for m in members if m.display_name or m.first_name}))
    prompt = PROMPT.format(issue=issue_name, team=team or "(não informado)", transcript=transcript)
    try:
        response = requests.post(
            f"{settings.OLLAMA_URL.rstrip('/')}/api/generate",
            json={
                "model": settings.OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {
                    "num_ctx": settings.OLLAMA_NUM_CTX,
                    "num_thread": settings.OLLAMA_THREADS,
                    "temperature": 0.2,
                },
            },
            timeout=3600,
        )
        response.raise_for_status()
        raw = json.loads(response.json().get("response") or "{}")
    except (requests.RequestException, ValueError) as e:
        raise SummaryError(f"o resumo automático falhou: {e}") from e
    steps = []
    for step in raw.get("proximos_passos") or []:
        if isinstance(step, dict):
            step = {**step, "responsavel_id": match_member(step.get("responsavel"), members)}
        steps.append(step)
    raw["proximos_passos"] = steps
    return clean_summary(raw, [m.id for m in members])
