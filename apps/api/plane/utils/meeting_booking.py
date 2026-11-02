# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: "Solicitar reunião". O cliente escolhe, dentro do item, um horário em que todas as pessoas que atendem
o projeto estão livres na agenda do Google (livre/ocupado, sem ver os compromissos), e o Hub marca a reunião.

A configuração fica em ``Project.meeting_booking`` (ver ``clean_booking``)."""

# Python imports
import re
import uuid
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# Django imports
from django.utils.dateparse import parse_datetime

DEFAULTS = {
    "enabled": False,
    "host_ids": [],
    "duration_minutes": 30,
    "day_start": "09:00",
    "day_end": "18:00",
    "weekdays": [0, 1, 2, 3, 4],
    "notice_hours": 12,
    "window_days": 14,
}
DURATIONS = (15, 30, 45, 60, 90, 120)
_TIME = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def _int(value, low, high, default):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return number if low <= number <= high else default


def clean_booking(data, member_ids):
    """A configuração no formato certo. Quem atende precisa ser da equipe do projeto (admin ou membro)."""
    if not isinstance(data, dict):
        raise ValueError("meeting_booking must be an object")
    members = {str(member_id) for member_id in member_ids}
    hosts = []
    for host in data.get("host_ids") or []:
        try:
            host = str(uuid.UUID(str(host)))
        except ValueError:
            raise ValueError("INVALID_HOST") from None
        if host not in members:
            raise ValueError("INVALID_HOST")
        if host not in hosts:
            hosts.append(host)
    day_start = str(data.get("day_start") or DEFAULTS["day_start"])
    day_end = str(data.get("day_end") or DEFAULTS["day_end"])
    if not _TIME.match(day_start) or not _TIME.match(day_end) or day_start >= day_end:
        raise ValueError("INVALID_HOURS")
    weekdays = sorted({int(d) for d in data.get("weekdays", DEFAULTS["weekdays"]) if str(d).isdigit() and int(d) < 7})
    duration = int(data.get("duration_minutes") or DEFAULTS["duration_minutes"])
    if duration not in DURATIONS:
        raise ValueError("INVALID_DURATION")
    enabled = data.get("enabled") is True
    if enabled and (not hosts or not weekdays):
        raise ValueError("HOSTS_REQUIRED")
    return {
        "enabled": enabled,
        "host_ids": hosts,
        "duration_minutes": duration,
        "day_start": day_start,
        "day_end": day_end,
        "weekdays": weekdays,
        "notice_hours": _int(data.get("notice_hours"), 0, 168, DEFAULTS["notice_hours"]),
        "window_days": _int(data.get("window_days"), 1, 60, DEFAULTS["window_days"]),
    }


def booking_config(project):
    return {**DEFAULTS, **(project.meeting_booking or {})}


def project_zone(project):
    try:
        return ZoneInfo(project.workspace.timezone or "America/Sao_Paulo")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("America/Sao_Paulo")


def _parse(value):
    parsed = parse_datetime(value) if isinstance(value, str) else value
    if parsed is None:
        raise ValueError(f"invalid datetime: {value}")
    return parsed


def candidate_slots(config, zone, start_date, days, now):
    """Os horários possíveis pelas regras (dias, horário, antecedência), antes de olhar as agendas."""
    duration = timedelta(minutes=config["duration_minutes"])
    step = timedelta(minutes=min(30, config["duration_minutes"]))
    earliest = now + timedelta(hours=config["notice_hours"])
    last_day = (now.astimezone(zone) + timedelta(days=config["window_days"])).date()
    h0, m0 = (int(part) for part in config["day_start"].split(":"))
    h1, m1 = (int(part) for part in config["day_end"].split(":"))
    slots = []
    for offset in range(days):
        day = start_date + timedelta(days=offset)
        if day > last_day:
            break
        if day.weekday() not in config["weekdays"]:
            continue
        cursor = datetime.combine(day, time(h0, m0), tzinfo=zone)
        close = datetime.combine(day, time(h1, m1), tzinfo=zone)
        while cursor + duration <= close:
            if cursor >= earliest:
                slots.append((cursor, cursor + duration))
            cursor += step
    return slots


def free_slots(candidates, busy):
    """Tira os horários que batem com algum intervalo ocupado."""
    intervals = [(_parse(start), _parse(end)) for start, end in busy]
    return [(start, end) for start, end in candidates if not any(s < end and e > start for s, e in intervals)]
