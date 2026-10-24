# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Pespo: conta das datas de um item recorrente (sem banco, para testar à parte).

A regra tem uma frequência (diária, semanal, mensal, anual), um intervalo ("a cada N") e uma data
âncora, a primeira ocorrência (o prazo do item original). As ocorrências são as datas da série que
começa na âncora:

- diária: âncora + k·N dias;
- semanal: os dias da semana escolhidos (0 = segunda … 6 = domingo; sem escolha, o dia da âncora), nas
  semanas que distam da semana da âncora um múltiplo de N;
- mensal: o mesmo dia do mês da âncora a cada N meses (31 vira o último dia em mês mais curto);
- anual: o mesmo dia e mês a cada N anos (29/02 vira 28/02).
"""

# Python imports
import calendar
from datetime import date, timedelta

FREQUENCIES = ("daily", "weekly", "monthly", "yearly")
MAX_INTERVAL = 365
# Uma regra que não acha a próxima data nesse horizonte está quebrada (não deve acontecer).
SEARCH_LIMIT_DAYS = 366 * 12


def _months_between(start, end):
    return (end.year - start.year) * 12 + (end.month - start.month)


def _clamped(year, month, day):
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def is_occurrence(rule, day):
    """``rule``: dict com ``frequency``, ``interval``, ``weekdays`` e ``anchor_date`` (date)."""
    anchor = rule["anchor_date"]
    interval = max(1, int(rule.get("interval") or 1))
    if day < anchor:
        return False
    frequency = rule["frequency"]
    if frequency == "daily":
        return (day - anchor).days % interval == 0
    if frequency == "weekly":
        weekdays = set(rule.get("weekdays") or []) or {anchor.weekday()}
        if day.weekday() not in weekdays:
            return False
        anchor_week = anchor - timedelta(days=anchor.weekday())
        day_week = day - timedelta(days=day.weekday())
        return ((day_week - anchor_week).days // 7) % interval == 0
    if frequency == "monthly":
        months = _months_between(anchor, day)
        return months % interval == 0 and day == _clamped(day.year, day.month, anchor.day)
    if frequency == "yearly":
        years = day.year - anchor.year
        return years % interval == 0 and day == _clamped(day.year, anchor.month, anchor.day)
    raise ValueError(f"Unknown frequency: {frequency}")


def next_occurrence(rule, after):
    """Primeira ocorrência estritamente depois de ``after`` (ou None se passar de ``end_date``)."""
    anchor = rule["anchor_date"]
    end = rule.get("end_date")
    frequency = rule["frequency"]
    interval = max(1, int(rule.get("interval") or 1))
    day = max(after + timedelta(days=1), anchor)
    # Saltos grandes para mensal/anual; dia a dia para diária/semanal (no máximo 7·N passos).
    if frequency == "monthly":
        months = max(0, _months_between(anchor, day))
        months -= months % interval
        candidate = _clamped(
            anchor.year + (anchor.month - 1 + months) // 12, (anchor.month - 1 + months) % 12 + 1, anchor.day
        )
        while candidate < day:
            months += interval
            candidate = _clamped(
                anchor.year + (anchor.month - 1 + months) // 12, (anchor.month - 1 + months) % 12 + 1, anchor.day
            )
        day = candidate
    elif frequency == "yearly":
        years = max(0, day.year - anchor.year)
        years -= years % interval
        candidate = _clamped(anchor.year + years, anchor.month, anchor.day)
        while candidate < day:
            years += interval
            candidate = _clamped(anchor.year + years, anchor.month, anchor.day)
        day = candidate
    else:
        for _ in range(SEARCH_LIMIT_DAYS):
            if is_occurrence(rule, day):
                break
            day += timedelta(days=1)
        else:
            return None
    if end and day > end:
        return None
    return day


def validate_rule(data):
    """Normaliza o que veio da API. Devolve (regra, None) ou (None, código de erro)."""
    frequency = data.get("frequency")
    if frequency not in FREQUENCIES:
        return None, "INVALID_FREQUENCY"
    try:
        raw = data.get("interval")
        interval = 1 if raw is None or raw == "" else int(raw)
    except (TypeError, ValueError):
        return None, "INVALID_INTERVAL"
    if not 1 <= interval <= MAX_INTERVAL:
        return None, "INVALID_INTERVAL"
    weekdays = data.get("weekdays") or []
    if not isinstance(weekdays, list) or any(not isinstance(d, int) or not 0 <= d <= 6 for d in weekdays):
        return None, "INVALID_WEEKDAYS"
    return {
        "frequency": frequency,
        "interval": interval,
        "weekdays": sorted(set(weekdays)) if frequency == "weekly" else [],
    }, None
