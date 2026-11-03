# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: cria no Acervo (Nextcloud) a pasta dos projetos que já existiam antes da integração.

Por padrão, só dos projetos ligados a um cliente no portal (``clientes.plane_project_id``, lido com o
``PORTAL_DATABASE_URL``); ``--todos`` cria de todos os projetos não arquivados. ``--simular`` só mostra o que faria.
Os outros projetos ganham a pasta no primeiro link de uma peça ou pelo botão em Configurações › Acervo.

    python manage.py acervo_criar_pastas --simular
    python manage.py acervo_criar_pastas
"""

# Django imports
from django.core.management import BaseCommand, CommandError

# Module imports
from plane.db.models import Project
from plane.utils import acervo
from plane.utils.nextcloud import NextcloudError
from plane.utils.portal_contracts import PortalUnavailable, client_project_ids


class Command(BaseCommand):
    help = "Cria no Acervo (Nextcloud) a pasta dos projetos de cliente que ainda não têm"

    def add_arguments(self, parser):
        parser.add_argument("--todos", action="store_true", help="Todos os projetos, não só os de cliente")
        parser.add_argument("--simular", action="store_true", help="Só mostra o que faria")

    def handle(self, *args, **options):
        if not acervo.is_enabled():
            raise CommandError("Configure NEXTCLOUD_URL, NEXTCLOUD_USER e NEXTCLOUD_APP_PASSWORD antes.")
        projects = Project.objects.filter(archived_at__isnull=True).select_related("workspace").order_by("name")
        if not options["todos"]:
            try:
                projects = projects.filter(id__in=client_project_ids())
            except PortalUnavailable as e:
                raise CommandError(f"Banco do portal indisponível ({e}). Use --todos ou confira o PORTAL_DATABASE_URL.")

        client = None if options["simular"] else acervo.get_client()
        created = failed = 0
        for project in projects:
            path = project.acervo_folder or acervo.default_project_folder(project)
            if options["simular"]:
                self.stdout.write(f"{project.name}: {path}{'' if project.acervo_folder else ' (nova)'}")
                continue
            try:
                acervo.ensure_project_folder(project, client)
            except NextcloudError as e:
                failed += 1
                self.stderr.write(f"{project.name}: falhou ({e})")
                continue
            created += 1
            self.stdout.write(f"{project.name}: {project.acervo_folder}")
        if not options["simular"]:
            self.stdout.write(self.style.SUCCESS(f"Pronto: {created} pasta(s) conferida(s), {failed} falha(s)."))
