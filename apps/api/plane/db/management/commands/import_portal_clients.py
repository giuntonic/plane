# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: traz os clientes, contratos e categorias contratadas do banco do portal para o Hub.

Lê com o usuário só leitura que o Hub já usa (``PORTAL_DATABASE_URL``: SELECT em ``clientes``, ``contratos`` e
``contrato_categorias``) e cria ou atualiza ``PespoClient``, ``PespoContract`` e ``PespoContractCategory``. Não
escreve nada no portal. Pode rodar quantas vezes for preciso durante a transição: acha o mesmo cliente e o mesmo
contrato pelos ids do portal. Os logins do portal (``clientes_login``) ficam de fora: o usuário do Hub não lê essa
tabela, e o acesso do cliente ao Hub ainda depende de decisão.

    python manage.py import_portal_clients --dry-run   # mostra o que faria, sem gravar
    python manage.py import_portal_clients
"""

# Python imports
from collections import defaultdict

# Third party imports
import psycopg
from psycopg.rows import dict_row

# Django imports
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

# Module imports
from plane.db.models import PespoClient, PespoContract, PespoContractCategory, Project


REPORT_KEYS = (
    "clients_created",
    "clients_updated",
    "clients_skipped",
    "contracts_created",
    "contracts_updated",
    "contracts_skipped",
    "categories",
)


def fetch_portal_rows(database_url):
    """As três tabelas do portal, como listas de dicionários."""
    with psycopg.connect(database_url, connect_timeout=5, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT cliente_id, cliente_nome, plane_project_id::text AS plane_project_id, plane_workspace_slug
                   FROM clientes ORDER BY cliente_id"""
            )
            clients = cur.fetchall()
            cur.execute(
                """SELECT id, cliente_id, tipo_contrato, data_inicio, data_fim, status, limite_urgentes,
                          aviso_vencimento_enviado_em
                   FROM contratos ORDER BY id"""
            )
            contracts = cur.fetchall()
            cur.execute("SELECT contrato_id, categoria, quantidade_contratada FROM contrato_categorias")
            categories = cur.fetchall()
    return {"clients": clients, "contracts": contracts, "categories": categories}


def apply_portal_rows(rows):
    """Grava no Hub; devolve o resumo (contagens e avisos). Chamar dentro de uma transação."""
    report = dict.fromkeys(REPORT_KEYS, 0)
    warnings = []
    contracts_by_client = defaultdict(list)
    for contract in rows["contracts"]:
        contracts_by_client[contract["cliente_id"]].append(contract)
    categories_by_contract = defaultdict(list)
    for category in rows["categories"]:
        categories_by_contract[category["contrato_id"]].append(category)

    for row in rows["clients"]:
        portal_id = str(row["cliente_id"])
        project = (
            Project.objects.filter(pk=row["plane_project_id"]).select_related("workspace").first()
            if row["plane_project_id"]
            else None
        )
        if project is None:
            report["clients_skipped"] += 1
            warnings.append(f'cliente "{portal_id}" sem projeto no Hub ({row["plane_project_id"] or "vazio"})')
            continue
        workspace = project.workspace
        if row["plane_workspace_slug"] and row["plane_workspace_slug"] != workspace.slug:
            warnings.append(
                f'cliente "{portal_id}": o portal diz {row["plane_workspace_slug"]}, o projeto está em {workspace.slug}'
            )

        client = PespoClient.objects.filter(workspace=workspace, portal_client_id=portal_id).first()
        if client is None:
            client = PespoClient.objects.create(
                workspace=workspace, portal_client_id=portal_id, name=row["cliente_nome"]
            )
            report["clients_created"] += 1
        else:
            # salva sempre: o updated_at diz quando o cliente veio do portal pela última vez
            client.name = row["cliente_nome"]
            client.save(update_fields=["name", "updated_at"])
            report["clients_updated"] += 1
        client.projects.add(project)

        for portal_contract in contracts_by_client.get(row["cliente_id"], []):
            status = PespoContract.PORTAL_STATUS.get((portal_contract["status"] or "").lower())
            contract_type = (portal_contract["tipo_contrato"] or "").upper()
            if status is None or contract_type not in PespoContract.Type.values:
                report["contracts_skipped"] += 1
                warnings.append(
                    f"contrato {portal_contract['id']} ({portal_id}): tipo {portal_contract['tipo_contrato']!r} "
                    f"ou situação {portal_contract['status']!r} desconhecidos"
                )
                continue
            fields = {
                "client": client,
                "contract_type": contract_type,
                "start_date": portal_contract["data_inicio"],
                "end_date": portal_contract["data_fim"],
                "status": status,
                "urgent_limit": portal_contract["limite_urgentes"] or 0,
                "expiry_notice_sent_at": portal_contract["aviso_vencimento_enviado_em"],
            }
            contract = PespoContract.objects.filter(
                workspace=workspace, portal_contract_id=portal_contract["id"]
            ).first()
            if contract is None:
                contract = PespoContract.objects.create(
                    workspace=workspace, portal_contract_id=portal_contract["id"], **fields
                )
                report["contracts_created"] += 1
            else:
                for name, value in fields.items():
                    setattr(contract, name, value)
                contract.save()
                report["contracts_updated"] += 1

            portal_categories = {
                c["categoria"]: c["quantidade_contratada"] or 0
                for c in categories_by_contract.get(contract.portal_contract_id, [])
            }
            existing = {c.category: c for c in contract.categories.all()}
            for name, contracted in portal_categories.items():
                category = existing.pop(name, None)
                if category is None:
                    PespoContractCategory.objects.create(contract=contract, category=name, contracted=contracted)
                elif category.contracted != contracted:
                    category.contracted = contracted
                    category.save(update_fields=["contracted", "updated_at"])
                report["categories"] += 1
            for leftover in existing.values():
                # categoria que saiu do contrato no portal
                leftover.delete(soft=False)
    return report, warnings


class Command(BaseCommand):
    help = "Traz clientes, contratos e categorias do banco do portal para o Hub (só lê o portal)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Mostra o que faria, sem gravar no Hub.")
        parser.add_argument(
            "--database-url", default=None, help="Banco do portal (padrão: PORTAL_DATABASE_URL das configurações)."
        )

    def handle(self, *args, **options):
        database_url = options["database_url"] or settings.PORTAL_DATABASE_URL
        if not database_url:
            raise CommandError("Sem PORTAL_DATABASE_URL: não há de onde ler os clientes.")
        try:
            rows = fetch_portal_rows(database_url)
        except psycopg.Error as e:
            raise CommandError(f"Não foi possível ler o banco do portal: {e}") from e

        with transaction.atomic():
            report, warnings = apply_portal_rows(rows)
            if options["dry_run"]:
                transaction.set_rollback(True)

        prefix = "[ensaio, nada foi gravado] " if options["dry_run"] else ""
        self.stdout.write(
            f"{prefix}Portal: {len(rows['clients'])} clientes, {len(rows['contracts'])} contratos, "
            f"{len(rows['categories'])} categorias."
        )
        self.stdout.write(
            f"Hub: clientes {report['clients_created']} novos, {report['clients_updated']} atualizados, "
            f"{report['clients_skipped']} sem projeto; contratos {report['contracts_created']} novos, "
            f"{report['contracts_updated']} atualizados, {report['contracts_skipped']} ignorados; "
            f"{report['categories']} categorias."
        )
        for warning in warnings:
            self.stdout.write(self.style.WARNING(f"Aviso: {warning}"))
