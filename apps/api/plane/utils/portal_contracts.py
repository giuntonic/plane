# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Pespo: contrato do cliente de um projeto, lido do banco do portal do cliente (portal-db).

O banco do portal continua sendo a fonte dos contratos (o painel admin cria e renova); o Plane só lê,
com um usuário de leitura (``PORTAL_DATABASE_URL``): ``clientes`` liga o cliente ao projeto do Plane
(``plane_project_id``), ``contratos`` e ``contrato_categorias`` dizem quanto foi contratado.
"""

# Python imports
import logging

# Third party imports
import psycopg
from psycopg.rows import dict_row

# Django imports
from django.conf import settings

logger = logging.getLogger("plane.api")


class PortalUnavailable(Exception):
    """Sem ``PORTAL_DATABASE_URL`` ou sem conexão com o banco do portal."""


def get_project_contract(project_id):
    """``None`` se o projeto não é de nenhum cliente; senão o cliente, o contrato ativo (ou ``None``)
    e o contrato que vence mais cedo (ativo ou vencido, para o aviso de vencimento)."""
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
