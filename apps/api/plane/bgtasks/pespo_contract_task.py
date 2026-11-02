# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: contrato vencendo, pelo beat do Hub (no lugar do workflow "Vencimento de Contratos" do n8n).

Desligado por padrão (``PESPO_CONTRACT_EXPIRY_ENABLED``): só faz sentido com os contratos no Hub
(``PESPO_CONTRACTS_SOURCE=hub``) e o workflow do n8n desligado, senão o aviso sai duas vezes. A regra é a do n8n:

- contrato ativo que vence nos próximos ``PESPO_CONTRACT_EXPIRY_DAYS`` dias (14) e ainda sem aviso: cria um item
  no projeto do cliente ("Contrato vence em dd/mm/aaaa", no estado padrão, com o prazo no dia do fim) e marca o
  aviso como enviado, para não repetir;
- contrato ativo que já passou do fim: vira "vencido".

Junto com o item, o cliente recebe o aviso "contrato vencendo" (``ClientNotice``), se o projeto deixar."""

# Python imports
import logging
from datetime import timedelta
from zoneinfo import ZoneInfo

# Third party imports
from celery import shared_task

# Django imports
from django.conf import settings
from django.utils import timezone
from django.utils.html import escape

# Module imports
from plane.db.models import Issue, PespoContract
from plane.db.models.pespo_client_notice import queue_client_notice
from plane.utils.client_notices import CONTRACT_EXPIRING

logger = logging.getLogger("plane.worker")

ZONE = ZoneInfo("America/Sao_Paulo")


def _notice_html(contract, days_left):
    categories = ", ".join(f"{c.category}: {c.contracted}" for c in contract.categories.all()) or "nenhuma"
    when = "vence hoje" if days_left == 0 else f"vence em {days_left} dia{'s' if days_left != 1 else ''}"
    return (
        f"<p>O contrato {escape(contract.contract_type)} de {escape(contract.client.name)} "
        f"({contract.start_date:%d/%m/%Y} a {contract.end_date:%d/%m/%Y}) {when}.</p>"
        f"<p><strong>Categorias contratadas:</strong> {escape(categories)}</p>"
        "<p>Combine a renovação com o cliente e renove o contrato.</p>"
    )


@shared_task
def contract_expiry_check():
    if not settings.PESPO_CONTRACT_EXPIRY_ENABLED:
        return {"skipped": "disabled"}
    today = timezone.now().astimezone(ZONE).date()
    limit = today + timedelta(days=settings.PESPO_CONTRACT_EXPIRY_DAYS)

    expired = PespoContract.objects.filter(status=PespoContract.Status.ACTIVE, end_date__lt=today).update(
        status=PespoContract.Status.EXPIRED, updated_at=timezone.now()
    )

    notices = 0
    pending = (
        PespoContract.objects.filter(
            status=PespoContract.Status.ACTIVE,
            end_date__gte=today,
            end_date__lte=limit,
            expiry_notice_sent_at__isnull=True,
        )
        .select_related("client")
        .prefetch_related("categories")
    )
    for contract in pending:
        project = contract.client.projects.filter(archived_at__isnull=True).order_by("created_at").first()
        if project is None:
            logger.warning("pespo contract %s: client %s has no active project", contract.id, contract.client_id)
            continue
        issue = Issue(
            name=f"Contrato vence em {contract.end_date:%d/%m/%Y}",
            project=project,
            workspace_id=project.workspace_id,
            description_html=_notice_html(contract, (contract.end_date - today).days),
            target_date=contract.end_date,
            priority="high",
        )
        issue.save(disable_auto_set_user=True)
        contract.expiry_notice_sent_at = timezone.now()
        contract.save(update_fields=["expiry_notice_sent_at", "updated_at"], disable_auto_set_user=True)
        queue_client_notice(project, CONTRACT_EXPIRING, contract=contract)
        notices += 1
    return {"expired": expired, "notices": notices}
