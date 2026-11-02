# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: clientes e contratos no Hub: importação do portal, leitura do contrato pelo Hub, a tela só de leitura e
o aviso de contrato vencendo."""

from datetime import date, timedelta
from io import StringIO
from zoneinfo import ZoneInfo

import pytest
from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.bgtasks.pespo_contract_task import contract_expiry_check
from plane.db.management.commands import import_portal_clients
from plane.db.management.commands.import_portal_clients import apply_portal_rows
from plane.db.models import (
    Issue,
    PespoClient,
    PespoContract,
    PespoContractCategory,
    Project,
    ProjectMember,
    User,
    WorkspaceMember,
)
from plane.utils.portal_contracts import PortalUnavailable, get_project_contract


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Cliente Acme", identifier="ACME", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


def _rows(project, workspace, **overrides):
    rows = {
        "clients": [
            {
                "cliente_id": "acme",
                "cliente_nome": "Acme Alimentos",
                "plane_project_id": str(project.id),
                "plane_workspace_slug": workspace.slug,
            },
            {
                "cliente_id": "sumiu",
                "cliente_nome": "Sem projeto",
                "plane_project_id": "00000000-0000-0000-0000-000000000000",
                "plane_workspace_slug": workspace.slug,
            },
        ],
        "contracts": [
            {
                "id": 7,
                "cliente_id": "acme",
                "tipo_contrato": "FEE",
                "data_inicio": date(2026, 9, 1),
                "data_fim": date(2026, 12, 31),
                "status": "ativo",
                "limite_urgentes": 2,
                "aviso_vencimento_enviado_em": None,
            },
            {
                "id": 3,
                "cliente_id": "acme",
                "tipo_contrato": "FEP",
                "data_inicio": date(2026, 5, 1),
                "data_fim": date(2026, 8, 31),
                "status": "renovado",
                "limite_urgentes": 1,
                "aviso_vencimento_enviado_em": None,
            },
        ],
        "categories": [
            {"contrato_id": 7, "categoria": "Post", "quantidade_contratada": 6},
            {"contrato_id": 7, "categoria": "Reels", "quantidade_contratada": 2},
            {"contrato_id": 3, "categoria": "Post", "quantidade_contratada": 4},
        ],
    }
    rows.update(overrides)
    return rows


@pytest.mark.contract
@pytest.mark.django_db
class TestImportPortalClients:
    def test_import_is_repeatable(self, workspace, project):
        report, warnings = apply_portal_rows(_rows(project, workspace))
        assert report["clients_created"] == 1 and report["clients_skipped"] == 1
        assert report["contracts_created"] == 2
        assert any("sumiu" in warning for warning in warnings)
        client = PespoClient.objects.get(portal_client_id="acme")
        assert client.name == "Acme Alimentos" and list(client.projects.all()) == [project]
        active = PespoContract.objects.get(portal_contract_id=7)
        assert active.status == PespoContract.Status.ACTIVE and active.urgent_limit == 2
        assert PespoContract.objects.get(portal_contract_id=3).status == PespoContract.Status.RENEWED
        assert {c.category: c.contracted for c in active.categories.all()} == {"Post": 6, "Reels": 2}

        # de novo, com mudanças no portal: nome, quantidade e uma categoria que saiu
        rows = _rows(project, workspace)
        rows["clients"][0]["cliente_nome"] = "Acme Alimentos SA"
        rows["categories"] = [
            {"contrato_id": 7, "categoria": "Post", "quantidade_contratada": 8},
            {"contrato_id": 3, "categoria": "Post", "quantidade_contratada": 4},
        ]
        report, _ = apply_portal_rows(rows)
        assert report["clients_created"] == 0 and report["clients_updated"] == 1
        assert report["contracts_created"] == 0 and report["contracts_updated"] == 2
        assert PespoClient.objects.count() == 1 and PespoContract.objects.count() == 2
        assert PespoClient.objects.get().name == "Acme Alimentos SA"
        assert {c.category: c.contracted for c in active.categories.all()} == {"Post": 8}

    def test_unknown_contract_status_is_skipped(self, workspace, project):
        rows = _rows(project, workspace)
        rows["contracts"][0]["status"] = "suspenso"
        report, warnings = apply_portal_rows(rows)
        assert report["contracts_skipped"] == 1
        assert any("suspenso" in warning for warning in warnings)

    def test_command_dry_run_writes_nothing(self, workspace, project, monkeypatch, settings):
        settings.PORTAL_DATABASE_URL = "postgresql://ignored"
        monkeypatch.setattr(import_portal_clients, "fetch_portal_rows", lambda url: _rows(project, workspace))
        out = StringIO()
        call_command("import_portal_clients", "--dry-run", stdout=out)
        assert "ensaio" in out.getvalue() and "clientes 1 novos" in out.getvalue()
        assert not PespoClient.objects.exists()
        call_command("import_portal_clients", stdout=StringIO())
        assert PespoClient.objects.count() == 1 and PespoContractCategory.objects.count() == 3


@pytest.mark.contract
@pytest.mark.django_db
class TestContractSource:
    def test_hub_source_reads_the_imported_contract(self, workspace, project, settings):
        apply_portal_rows(_rows(project, workspace))
        settings.PESPO_CONTRACTS_SOURCE = "hub"
        data = get_project_contract(project.id)
        assert data["client_name"] == "Acme Alimentos"
        assert data["contract"]["type"] == "FEE" and data["contract"]["urgent_limit"] == 2
        assert data["contract"]["categories"] == [
            {"category": "Post", "contracted": 6},
            {"category": "Reels", "contracted": 2},
        ]
        assert data["expiring"]["status"] == "ativo"
        other = Project.objects.create(name="Outro", identifier="OUT", workspace=workspace)
        assert get_project_contract(other.id) is None

    def test_portal_source_needs_the_portal_database(self, project, settings):
        settings.PESPO_CONTRACTS_SOURCE = "portal"
        settings.PORTAL_DATABASE_URL = None
        with pytest.raises(PortalUnavailable):
            get_project_contract(project.id)

    def test_settings_view(self, session_client, workspace, project, settings):
        settings.PESPO_CONTRACTS_SOURCE = "portal"
        settings.PORTAL_DATABASE_URL = None
        apply_portal_rows(_rows(project, workspace))
        url = reverse("project-contract", kwargs={"slug": workspace.slug, "project_id": project.id})
        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["source"] == "portal" and response.data["current_status"] == "unavailable"
        assert response.data["hub"]["client"]["name"] == "Acme Alimentos"
        assert [c["status"] for c in response.data["hub"]["contracts"]] == ["active", "renewed"]

    def test_guest_cannot_open(self, workspace, project):
        guest = User.objects.create(email="cliente@acme.com", username="cliente_acme")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(project=project, member=guest, role=5, is_active=True)
        client = APIClient()
        client.force_authenticate(user=guest)
        url = reverse("project-contract", kwargs={"slug": workspace.slug, "project_id": project.id})
        assert client.get(url).status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
@pytest.mark.django_db
class TestContractExpiry:
    def _contract(self, workspace, project, end, **fields):
        client, _ = PespoClient.objects.get_or_create(workspace=workspace, name="Acme")
        client.projects.add(project)
        contract = PespoContract.objects.create(
            workspace=workspace, client=client, start_date=end - timedelta(days=120), end_date=end, **fields
        )
        PespoContractCategory.objects.create(contract=contract, category="Post", contracted=6)
        return contract

    def test_can_be_disabled(self, workspace, project, settings):
        settings.PESPO_CONTRACT_EXPIRY_ENABLED = False
        self._contract(workspace, project, date.today() + timedelta(days=5))
        assert contract_expiry_check() == {"skipped": "disabled"}
        assert not Issue.objects.filter(project=project).exists()

    def test_notice_once_and_expire(self, workspace, project, settings):
        settings.PESPO_CONTRACT_EXPIRY_ENABLED = True
        today = timezone.now().astimezone(ZoneInfo("America/Sao_Paulo")).date()
        soon = self._contract(workspace, project, today + timedelta(days=10))
        far = self._contract(workspace, project, today + timedelta(days=40))
        ended = self._contract(workspace, project, today - timedelta(days=1))
        assert contract_expiry_check() == {"expired": 1, "notices": 1}
        issue = Issue.objects.get(project=project)
        assert issue.name == f"Contrato vence em {soon.end_date:%d/%m/%Y}"
        assert issue.target_date == soon.end_date and "Post: 6" in issue.description_html
        soon.refresh_from_db()
        far.refresh_from_db()
        ended.refresh_from_db()
        assert soon.expiry_notice_sent_at is not None and far.expiry_notice_sent_at is None
        assert ended.status == PespoContract.Status.EXPIRED
        # rodar de novo não repete o aviso
        assert contract_expiry_check() == {"expired": 0, "notices": 0}
        assert Issue.objects.filter(project=project).count() == 1
