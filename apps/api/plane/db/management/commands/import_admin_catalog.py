# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: traz as funções e os serviços do painel admin para o Hub (``TeamRole`` e ``TeamService``).

Lê o banco ``admin_portal`` (``funcoes``, ``servicos``, ``funcao_servicos``, ``funcionarios`` e
``funcionario_funcoes``) pelo endereço passado em ``--database-url`` e não escreve nele. Os funcionários são
achados pelo e-mail entre os membros da equipe do espaço de trabalho; quem não está no Hub é avisado e pulado.
Pode rodar de novo: serviço pelo endereço, função pelo nome.

    python manage.py import_admin_catalog --workspace pespo-hub --database-url postgresql://… --dry-run
"""

# Third party imports
import psycopg
from psycopg.rows import dict_row

# Django imports
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

# Module imports
from plane.db.models import TeamRole, TeamService, Workspace, WorkspaceMember


class Command(BaseCommand):
    help = "Traz as funções e os serviços do painel admin para o Hub (só lê o painel)."

    def add_arguments(self, parser):
        parser.add_argument("--workspace", required=True, help="Slug do espaço de trabalho.")
        parser.add_argument("--database-url", required=True, help="Banco admin_portal (usuário só leitura).")
        parser.add_argument("--dry-run", action="store_true", help="Mostra o que faria, sem gravar no Hub.")

    def handle(self, *args, **options):
        workspace = Workspace.objects.filter(slug=options["workspace"]).first()
        if workspace is None:
            raise CommandError(f"Espaço de trabalho {options['workspace']} não existe.")
        try:
            with psycopg.connect(options["database_url"], connect_timeout=5, row_factory=dict_row) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT id, nome, subdominio, url, icone, descricao, ordem FROM servicos")
                    services = cur.fetchall()
                    cur.execute("SELECT id, nome, descricao FROM funcoes")
                    roles = cur.fetchall()
                    cur.execute("SELECT funcao_id, servico_id FROM funcao_servicos")
                    role_services = cur.fetchall()
                    cur.execute(
                        """SELECT ff.funcao_id, lower(f.email) AS email FROM funcionario_funcoes ff
                           JOIN funcionarios f ON f.id = ff.funcionario_id WHERE f.ativo"""
                    )
                    role_members = cur.fetchall()
        except psycopg.Error as e:
            raise CommandError(f"Não foi possível ler o banco do painel: {e}") from e

        team = {
            m.member.email.lower(): m.member_id
            for m in WorkspaceMember.objects.filter(workspace=workspace, is_active=True, role__gte=15).select_related(
                "member"
            )
        }
        warnings = []
        with transaction.atomic():
            service_map = {}
            for row in services:
                service = TeamService.objects.filter(workspace=workspace, url=row["url"]).first() or TeamService(
                    workspace=workspace, url=row["url"]
                )
                service.name = row["nome"]
                service.icon = (row["icone"] or "🔧")[:16]
                service.description = (row["descricao"] or "")[:500]
                service.sort_order = row["ordem"] or 0
                service.save()
                service_map[row["id"]] = service
            for row in roles:
                role = TeamRole.objects.filter(workspace=workspace, name__iexact=row["nome"]).first() or TeamRole(
                    workspace=workspace, name=row["nome"]
                )
                role.description = (row["descricao"] or "")[:500]
                role.save()
                role.services.set([service_map[r["servico_id"]] for r in role_services if r["funcao_id"] == row["id"]])
                member_ids = []
                for r in role_members:
                    if r["funcao_id"] != row["id"]:
                        continue
                    if r["email"] in team:
                        member_ids.append(team[r["email"]])
                    else:
                        warnings.append(f"{r['email']} ({row['nome']}) não está na equipe do Hub")
                role.members.set(member_ids)
            if options["dry_run"]:
                transaction.set_rollback(True)

        prefix = "[ensaio, nada foi gravado] " if options["dry_run"] else ""
        self.stdout.write(f"{prefix}{len(services)} serviços e {len(roles)} funções do painel admin.")
        for warning in sorted(set(warnings)):
            self.stdout.write(self.style.WARNING(f"Aviso: {warning}"))
