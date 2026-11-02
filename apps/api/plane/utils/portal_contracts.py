# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Pespo: contrato do cliente de um projeto, lido do banco do portal do cliente (portal-db).

O banco do portal continua sendo a fonte dos contratos (o painel admin cria e renova); o Plane só lê,
com um usuário de leitura (``PORTAL_DATABASE_URL``): ``clientes`` liga o cliente ao projeto do Plane
(``plane_project_id``), ``contratos`` e ``contrato_categorias`` dizem quanto foi contratado.

Com ``PESPO_CONTRACTS_SOURCE=hub``, o contrato vem dos modelos do Hub (``PespoClient`` e ``PespoContract``,
preenchidos pelo comando ``import_portal_clients``), com a mesma resposta. O padrão é ``portal``.
"""

# Python imports
import logging

# Third party imports
import psycopg
from psycopg.rows import dict_row

# Django imports
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger("plane.api")


class PortalUnavailable(Exception):
    """Sem ``PORTAL_DATABASE_URL`` ou sem conexão com o banco do portal."""


def contracts_source():
    return "hub" if (settings.PESPO_CONTRACTS_SOURCE or "").strip().lower() == "hub" else "portal"


def _hub_project_contract(project_id):
    from plane.db.models import PespoClient, PespoContract  # noqa: PLC0415 (utils carregam antes dos modelos)

    client = PespoClient.objects.filter(projects__id=project_id).order_by("created_at").first()
    if not client:
        return None
    contract = (
        client.contracts.filter(status=PespoContract.Status.ACTIVE)
        .prefetch_related("categories")
        .order_by("-start_date")
        .first()
    )
    expiring = (
        client.contracts.filter(status__in=[PespoContract.Status.ACTIVE, PespoContract.Status.EXPIRED])
        .order_by("end_date")
        .first()
    )
    expiring_status = {PespoContract.Status.ACTIVE: "ativo", PespoContract.Status.EXPIRED: "vencido"}
    return {
        "client_id": client.portal_client_id or str(client.id),
        "client_name": client.name,
        "contract": (
            {
                "type": contract.contract_type,
                "start_date": contract.start_date,
                "end_date": contract.end_date,
                "urgent_limit": contract.urgent_limit,
                "categories": [
                    {"category": row.category, "contracted": row.contracted}
                    for row in sorted(contract.categories.all(), key=lambda row: row.category)
                ],
            }
            if contract
            else None
        ),
        "expiring": (
            {
                "end_date": expiring.end_date,
                "status": expiring_status[expiring.status],
                "days_left": (expiring.end_date - timezone.localdate()).days,
            }
            if expiring
            else None
        ),
    }


def get_project_contract(project_id):
    """``None`` se o projeto não é de nenhum cliente; senão o cliente, o contrato ativo (ou ``None``)
    e o contrato que vence mais cedo (ativo ou vencido, para o aviso de vencimento)."""
    if contracts_source() == "hub":
        return _hub_project_contract(project_id)
    if not settings.PORTAL_DATABASE_URL:
        raise PortalUnavailable("PORTAL_DATABASE_URL is not set")
    try:
        with psycopg.connect(settings.PORTAL_DATABASE_URL, connect_timeout=3, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT cliente_id, cliente_nome FROM clientes WHERE plane_project_id::text = %s LIMIT 1",
                    [str(project_id)],
                )
                client = cur.fetchone()
                if not client:
                    return None
                cur.execute(
                    """SELECT id, tipo_contrato, data_inicio, data_fim, status, limite_urgentes
                       FROM contratos WHERE cliente_id = %s AND status = 'ativo'
                       ORDER BY data_inicio DESC LIMIT 1""",
                    [client["cliente_id"]],
                )
                contract = cur.fetchone()
                categories = []
                if contract:
                    cur.execute(
                        """SELECT categoria, quantidade_contratada FROM contrato_categorias
                           WHERE contrato_id = %s ORDER BY categoria""",
                        [contract["id"]],
                    )
                    categories = cur.fetchall()
                cur.execute(
                    """SELECT data_fim, status, (data_fim - CURRENT_DATE) AS dias_restantes
                       FROM contratos WHERE cliente_id = %s AND status IN ('ativo', 'vencido')
                       ORDER BY data_fim ASC LIMIT 1""",
                    [client["cliente_id"]],
                )
                expiring = cur.fetchone()
    except psycopg.Error as e:
        logger.warning("portal-db unavailable: %s", e)
        raise PortalUnavailable(str(e)) from e

    return {
        "client_id": str(client["cliente_id"]),
        "client_name": client["cliente_nome"],
        "contract": (
            {
                "type": contract["tipo_contrato"],
                "start_date": contract["data_inicio"],
                "end_date": contract["data_fim"],
                "urgent_limit": contract["limite_urgentes"] or 0,
                "categories": [
                    {"category": row["categoria"], "contracted": row["quantidade_contratada"] or 0}
                    for row in categories
                ],
            }
            if contract
            else None
        ),
        "expiring": (
            {"end_date": expiring["data_fim"], "status": expiring["status"], "days_left": expiring["dias_restantes"]}
            if expiring
            else None
        ),
    }


def client_project_ids():
    """Ids (texto) dos projetos do Plane ligados a um cliente no portal (o Acervo cria a pasta deles no deploy)."""
    if not settings.PORTAL_DATABASE_URL:
        raise PortalUnavailable("PORTAL_DATABASE_URL is not set")
    try:
        with psycopg.connect(settings.PORTAL_DATABASE_URL, connect_timeout=3, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT DISTINCT plane_project_id::text AS project_id FROM clientes "
                    "WHERE plane_project_id IS NOT NULL"
                )
                return [row["project_id"] for row in cur.fetchall()]
    except psycopg.Error as e:
        logger.warning("portal-db unavailable: %s", e)
        raise PortalUnavailable(str(e)) from e
