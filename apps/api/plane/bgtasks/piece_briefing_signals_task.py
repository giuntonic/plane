# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Pespo: sinais do briefing de uma solicitação de peças, lidos pelo Laya (classificador da VPS, só na rede
interna). É a mesma regra do portal do cliente (portal-cliente/portal-app/lib/sinaisBriefing.js): só
comenta nos itens criados quando um sinal é forte, e não mexe em etiqueta nem prioridade ("Urgente" gasta
saldo do contrato; quem decide é a equipe). Limiares calibrados em 12 briefings de teste (set/2026):
urgência >= 0.8 (só quando nenhum item foi marcado Urgente) e insatisfação >= 0.7.

O comentário sai pelo usuário-bot "Laya", não gera notificação nem webhook e não aparece para convidados
(o cliente), ver ``plane.utils.team_only_comments``. Qualquer falha do Laya é ignorada.
"""

# Python imports
import logging
import uuid

# Third party imports
import requests
from celery import shared_task

# Django imports
from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import IntegrityError

# Module imports
from plane.db.models import Issue, IssueComment, User
from plane.db.models.user import BotTypeEnum
from plane.utils.team_only_comments import LAYA_COMMENT_SOURCE

logger = logging.getLogger("plane.worker")

URGENCY_THRESHOLD = 0.8
DISSATISFACTION_THRESHOLD = 0.7
MIN_BRIEFING_LENGTH = 15
MAX_BRIEFING_LENGTH = 4000
LAYA_TIMEOUT_SECONDS = 10
LAYA_BOT_USERNAME = "pespo_laya_bot"
LAYA_BOT_EMAIL = "laya-bot@pespo-hub.invalid"

QUESTIONS = {
    "urgencia": {
        "type": "choice",
        "instructions": "Qual o prazo pedido pelo cliente?",
        "criteria": {
            "urgente": "para hoje, amanhã, o quanto antes ou 'pra ontem'",
            "normal": "prazo de alguns dias ou semanas, data futura, ou nenhum prazo",
        },
    },
    "humor": {
        "type": "choice",
        "instructions": "Como o cliente se sente em relação ao nosso trabalho?",
        "criteria": {
            "insatisfeito": "reclama de erro, atraso, falta de resposta ou está irritado",
            "neutro": "só descreve o pedido, sem opinião sobre o trabalho",
            "satisfeito": "elogia ou agradece o trabalho",
        },
    },
}


def should_classify(briefing):
    return bool(settings.LAYA_URL) and len((briefing or "").strip()) >= MIN_BRIEFING_LENGTH


def classify(briefing):
    response = requests.post(
        f"{settings.LAYA_URL.rstrip('/')}/v1/systemone",
        json={"state": {"briefing": briefing[:MAX_BRIEFING_LENGTH]}, "questions": QUESTIONS},
        timeout=LAYA_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json().get("answers") or {}


def signals_comment_html(answers, marked_urgent):
    """HTML do comentário, ou None quando não há sinal forte."""
    p_urgent = ((answers.get("urgencia") or {}).get("probabilities") or {}).get("urgente") or 0
    p_unhappy = ((answers.get("humor") or {}).get("probabilities") or {}).get("insatisfeito") or 0
    signals = []
    if p_unhappy >= DISSATISFACTION_THRESHOLD:
        signals.append(
            f"😟 O cliente parece <strong>insatisfeito</strong> ({round(p_unhappy * 100)}%). "
            "Vale um contato do atendimento."
        )
    if p_urgent >= URGENCY_THRESHOLD and not marked_urgent:
        signals.append(
            f"⏱️ O texto indica <strong>urgência</strong> ({round(p_urgent * 100)}%), mas nenhum item foi marcado "
            "como Urgente. Confirme o prazo com o cliente."
        )
    if not signals:
        return None
    items = "".join(f"<li><p>{signal}</p></li>" for signal in signals)
    return (
        "<p><em>Sinais automáticos do briefing (Laya), só sugestão. Este comentário aparece só para a "
        f"equipe.</em></p><ul>{items}</ul>"
    )


def laya_bot_user():
    user = User.objects.filter(username=LAYA_BOT_USERNAME).first()
    if user:
        return user
    try:
        return User.objects.create(
            username=LAYA_BOT_USERNAME,
            display_name="Laya",
            first_name="Laya",
            last_name="",
            is_bot=True,
            bot_type=BotTypeEnum.PESPO_LAYA,
            email=LAYA_BOT_EMAIL,
            password=make_password(uuid.uuid4().hex),
            is_password_autoset=True,
        )
    except IntegrityError:
        # Duas solicitações ao mesmo tempo: a outra task criou o bot primeiro.
        return User.objects.get(username=LAYA_BOT_USERNAME)


@shared_task
def piece_briefing_signals(project_id, issue_ids, briefing, marked_urgent):
    if not should_classify(briefing):
        return
    try:
        answers = classify(briefing.strip())
    except (requests.RequestException, ValueError) as e:
        logger.warning("Laya indisponível, sinais do briefing não registrados: %s", e)
        return
    comment_html = signals_comment_html(answers, marked_urgent)
    if not comment_html:
        return
    bot = laya_bot_user()
    # Sem issue_activity de propósito: o comentário não notifica ninguém (nem o cliente que pediu) e não
    # dispara o webhook que o n8n ouve.
    for issue in Issue.objects.filter(project_id=project_id, id__in=issue_ids).select_related("project"):
        IssueComment.objects.create(
            issue=issue,
            project=issue.project,
            actor=bot,
            comment_html=comment_html,
            external_source=LAYA_COMMENT_SOURCE,
        )
