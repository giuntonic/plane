# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: avisos ao cliente (convidados do projeto) quando algo que ele espera acontece.

Eventos (decisão do Giuliano, 02/11/2026): peça entregue, refação pronta e contrato vencendo. Canal: e-mail;
o WhatsApp entra depois como outro canal em ``CHANNELS`` (``bgtasks/pespo_client_notice_task.py``).

A configuração fica em ``Project.client_notices`` (``{"email": bool, "events": {evento: bool}}``); vazia, vale
``DEFAULTS`` (tudo ligado)."""

DELIVERED = "delivered"
REWORK_DONE = "rework_done"
CONTRACT_EXPIRING = "contract_expiring"
EVENTS = (DELIVERED, REWORK_DONE, CONTRACT_EXPIRING)
# o e-mail "Seu acesso ao Pespo Hub", quando a equipe libera um login do cliente (sempre sai, não é um evento)
ACCESS = "access"
CHANNELS = ("email",)

DEFAULTS = {"email": True, "events": dict.fromkeys(EVENTS, True)}


def clean_client_notices(value):
    """Valida o que vem da tela; devolve a configuração completa."""
    if not isinstance(value, dict):
        raise ValueError("client_notices must be an object")
    events = value.get("events", {})
    if not isinstance(events, dict):
        raise ValueError("client_notices.events must be an object")
    return {
        "email": bool(value.get("email", DEFAULTS["email"])),
        "events": {event: bool(events.get(event, True)) for event in EVENTS},
    }


def project_settings(project):
    stored = project.client_notices or {}
    return {
        "email": stored.get("email", DEFAULTS["email"]),
        "events": {**DEFAULTS["events"], **(stored.get("events") or {})},
    }


def enabled_channels(project, event):
    """Os canais ligados para este evento no projeto (vazio = não avisar)."""
    config = project_settings(project)
    if not config["events"].get(event):
        return []
    return [channel for channel in CHANNELS if config.get(channel)]


def client_recipients(project_id):
    """Os convidados ativos do projeto (o cliente), sem bots: [{"id", "email", "name"}]."""
    from plane.db.models import ProjectMember  # noqa: PLC0415 (utils carregam antes dos modelos)

    members = (
        ProjectMember.objects.filter(
            project_id=project_id,
            role=5,
            is_active=True,
            member__is_active=True,
            member__is_bot=False,
        )
        .select_related("member")
        .order_by("member__email")
    )
    return [
        {
            "id": str(m.member_id),
            "email": m.member.email,
            "name": m.member.first_name or m.member.display_name or m.member.email,
        }
        for m in members
        if m.member.email
    ]
