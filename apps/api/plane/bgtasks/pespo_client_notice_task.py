# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: envia um aviso ao cliente (``ClientNotice``). Hoje só por e-mail, um e-mail por pessoa (os convidados
não veem os endereços uns dos outros). Para o WhatsApp, basta um ``_send_whatsapp`` em ``SENDERS`` e o canal em
``plane.utils.client_notices.CHANNELS``."""

# Python imports
import logging

# Third party imports
from celery import shared_task

# Django imports
from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string
from django.utils import timezone

# Module imports
from plane.db.models import ClientNotice
from plane.license.utils.instance_value import get_email_configuration
from plane.utils import client_notices
from plane.utils.email import generate_plain_text_from_html
from plane.utils.exception_logger import log_exception

logger = logging.getLogger("plane.worker")


def _web_url():
    return (settings.WEB_URL or "").rstrip("/")


def _content(notice):
    """Assunto, título, parágrafos, texto do botão e link."""
    project = notice.project
    base = _web_url()
    if notice.kind == client_notices.ACCESS:
        return {
            "subject": "Seu acesso ao Pespo Hub",
            "title": "Seu acesso ao Pespo Hub está liberado",
            "paragraphs": [
                f"A Pespo liberou para você o projeto <strong>{_escape(project.name)}</strong> no Pespo Hub, onde "
                "você acompanha, comenta e aprova as suas peças e pede peças novas.",
                "Entre com este e-mail: você recebe um código para digitar, ou entra com a sua conta Google.",
            ],
            "button": "Entrar no Pespo Hub",
            "url": f"{base}/",
        }
    if notice.kind == client_notices.CONTRACT_EXPIRING:
        contract = notice.contract
        end = f"{contract.end_date:%d/%m/%Y}" if contract else ""
        return {
            "subject": f"Seu contrato com a Pespo vence em {end}",
            "title": f"Seu contrato vence em {end}",
            "paragraphs": [
                f"O contrato {contract.contract_type if contract else ''} de {_escape(project.name)} vai até {end}.",
                "Vamos conversar sobre a renovação? Responda este e-mail ou fale com a gente pelo Hub.",
            ],
            "button": "Abrir o projeto no Hub",
            "url": f"{base}/{project.workspace.slug}/projects/{project.id}/issues/",
        }
    issue = notice.issue
    url = f"{base}/{project.workspace.slug}/browse/{project.identifier}-{issue.sequence_id}/"
    if notice.kind == client_notices.DELIVERED:
        return {
            "subject": f"Peça entregue: {issue.name}",
            "title": "Sua peça foi entregue",
            "paragraphs": [f"A peça <strong>{_escape(issue.name)}</strong>, de {_escape(project.name)}, foi entregue."],
            "button": "Ver a peça",
            "url": url,
        }
    return {
        "subject": f"Refação pronta: {issue.name}",
        "title": "A refação que você pediu está pronta",
        "paragraphs": [
            f"A peça <strong>{_escape(issue.name)}</strong>, de {_escape(project.name)}, foi refeita e está "
            "pronta para a sua revisão."
        ],
        "button": "Revisar a peça",
        "url": url,
    }


def _escape(text):
    from django.utils.html import escape  # noqa: PLC0415

    return escape(text or "")


def _send_email(notice, recipients):
    content = _content(notice)
    (host, user, password, port, use_tls, use_ssl, from_email) = get_email_configuration()
    if not host:
        raise RuntimeError("email is not configured")
    connection = get_connection(
        host=host,
        port=int(port),
        username=user,
        password=password,
        use_tls=use_tls == "1",
        use_ssl=use_ssl == "1",
    )
    for recipient in recipients:
        html = render_to_string(
            "emails/notifications/pespo_client_notice.html",
            {**content, "name": recipient["name"] or "", "project_name": notice.project.name},
        )
        message = EmailMultiAlternatives(
            subject=content["subject"],
            body=generate_plain_text_from_html(html),
            from_email=from_email,
            to=[recipient["email"]],
            connection=connection,
        )
        message.attach_alternative(html, "text/html")
        message.send()


SENDERS = {"email": _send_email}


@shared_task
def send_client_notice(notice_id):
    notice = (
        ClientNotice.objects.filter(pk=notice_id, status=ClientNotice.Status.QUEUED)
        .select_related("project", "project__workspace", "issue", "contract")
        .first()
    )
    if notice is None:
        return None
    # o aviso de acesso já nasce com o destinatário; os outros vão para os convidados do projeto agora
    recipients = notice.recipients or client_notices.client_recipients(notice.project_id)
    notice.recipients = recipients
    sender = SENDERS.get(notice.channel)
    if not recipients or sender is None:
        notice.status = ClientNotice.Status.SKIPPED
        notice.error = "no recipients" if not recipients else f"unknown channel {notice.channel}"
        notice.save(update_fields=["recipients", "status", "error", "updated_at"], disable_auto_set_user=True)
        return notice.status
    try:
        sender(notice, recipients)
    except Exception as e:  # noqa: BLE001 (registra no aviso e segue)
        log_exception(e)
        notice.status = ClientNotice.Status.FAILED
        notice.error = str(e)[:500]
    else:
        notice.status = ClientNotice.Status.SENT
        notice.sent_at = timezone.now()
        logger.info("pespo client notice %s sent to %d recipient(s)", notice.id, len(recipients))
    notice.save(update_fields=["recipients", "status", "error", "sent_at", "updated_at"], disable_auto_set_user=True)
    return notice.status
