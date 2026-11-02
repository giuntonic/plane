# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: clientes no Hub (Configurações do espaço de trabalho › Clientes): novo cliente, renovação com saldo e
logins do cliente."""

from datetime import date, timedelta

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    ClientNotice,
    EntityTemplate,
    Issue,
    IssueLabel,
    Label,
    PespoClient,
    PespoClientLogin,
    PespoContract,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
    WorkspaceMemberInvite,
)
from plane.utils.pespo_clients import attach_client_logins, suggest_identifier
from plane.utils.portal_contracts import get_project_contract

TODAY = date.today()


def _payload(**overrides):
    payload = {
        "name": "Acme Alimentos",
        "contract_type": "FEE",
        "start_date": str(TODAY - timedelta(days=10)),
        "end_date": str(TODAY + timedelta(days=80)),
        "urgent_limit": 2,
        "quantities": {"Post": 6, "Reels": 2, "Artigo": 1, "Anuncio": 0},
        "emails": "ana@acme.com, novo@acme.com",
    }
    payload.update(overrides)
    return payload


@pytest.fixture
def existing_client_user(db):
    return User.objects.create(email="ana@acme.com", username="ana_acme", first_name="Ana")


@pytest.mark.contract
@pytest.mark.django_db
class TestPespoClients:
    def _url(self, workspace, name="workspace-pespo-clients", **kwargs):
        return reverse(name, kwargs={"slug": workspace.slug, **kwargs})

    def test_new_client_creates_project_contract_and_logins(
        self, session_client, workspace, create_user, existing_client_user
    ):
        template = EntityTemplate.objects.create(
            workspace=workspace,
            kind="project",
            name="Cliente FEE",
            data={
                "states": [
                    {"name": "Fila de Criacao", "group": "unstarted", "default": True},
                    {"name": "Entregue", "group": "completed"},
                ],
                "labels": [{"name": "Post"}, {"name": "Reels"}],
            },
        )
        response = session_client.post(self._url(workspace), _payload(template_id=str(template.id)), format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data
        project = Project.objects.get(pk=response.data["project"]["id"])
        assert project.identifier == "AA" or len(project.identifier) >= 2
        assert project.pieces_view and project.guest_view_all_features
        assert set(State.objects.filter(project=project).values_list("name", flat=True)) == {
            "Fila de Criacao",
            "Entregue",
        }
        assert set(Label.objects.filter(project=project).values_list("name", flat=True)) == {"Post", "Reels"}
        assert ProjectMember.objects.filter(project=project, member=create_user, role=20).exists()
        client = PespoClient.objects.get(name="Acme Alimentos")
        contract = client.contracts.get()
        assert contract.status == "active" and {c.category: c.contracted for c in contract.categories.all()} == {
            "Post": 6,
            "Reels": 2,
            "Artigo": 1,
            "Anuncio": 0,
        }
        # quem já tem conta entra na hora; o e-mail novo ganha convite aceito
        statuses = {row["email"]: row["status"] for row in response.data["logins"]}
        assert statuses == {"ana@acme.com": "active", "novo@acme.com": "invited"}
        assert ProjectMember.objects.filter(project=project, member=existing_client_user, role=5).exists()
        invite = WorkspaceMemberInvite.objects.get(email="novo@acme.com")
        assert invite.accepted and invite.role == 5
        assert ClientNotice.objects.filter(kind="access").count() == 2
        # o contrato do painel de peças vem do Hub
        assert get_project_contract(project.id)["contract"]["urgent_limit"] == 2

    def test_new_login_joins_the_project_on_first_sign_in(self, session_client, workspace):
        response = session_client.post(self._url(workspace), _payload(emails=["novo@acme.com"]), format="json")
        project_id = response.data["project"]["id"]
        user = User.objects.create(email="novo@acme.com", username="novo_acme")
        # o login cria o membro do espaço de trabalho pelo convite aceito (process_workspace_project_invitations)
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=5)
        assert attach_client_logins(user) == 1
        assert ProjectMember.objects.filter(project_id=project_id, member=user, role=5, is_active=True).exists()

    def test_validation(self, session_client, workspace):
        response = session_client.post(
            self._url(workspace), _payload(end_date=str(TODAY - timedelta(days=30))), format="json"
        )
        assert response.data["code"] == "END_BEFORE_START"
        response = session_client.post(self._url(workspace), _payload(emails="nao-e-email"), format="json")
        assert response.data["code"] == "INVALID_EMAIL"
        response = session_client.post(self._url(workspace), _payload(contract_type="XYZ"), format="json")
        assert response.data["code"] == "INVALID_CONTRACT_TYPE"
        assert not Project.objects.filter(name="Acme Alimentos").exists()

    def test_renew_with_balance(self, session_client, workspace):
        response = session_client.post(self._url(workspace), _payload(emails=[]), format="json")
        client_id = response.data["client"]["id"]
        project = Project.objects.get(pk=response.data["project"]["id"])
        post, _ = Label.objects.get_or_create(project=project, workspace=workspace, name="Post")
        for n in range(2):
            issue = Issue.objects.create(name=f"Post {n}", project=project, workspace=workspace)
            IssueLabel.objects.create(issue=issue, label=post, project=project, workspace=workspace)
        url = self._url(workspace, "workspace-pespo-client-renew", pk=client_id)
        renewal = _payload(start_date=str(TODAY + timedelta(days=81)), end_date=str(TODAY + timedelta(days=170)))
        response = session_client.post(url, {**renewal, "keep_balance": True}, format="json")
        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["balance_added"]["Post"] == 4 and response.data["balance_added"]["Reels"] == 2
        client = PespoClient.objects.get(pk=client_id)
        assert list(client.contracts.order_by("start_date").values_list("status", flat=True)) == ["renewed", "active"]
        active = client.contracts.get(status=PespoContract.Status.ACTIVE)
        assert {c.category: c.contracted for c in active.categories.all()}["Post"] == 10
        assert Issue.objects.filter(project=project, name__startswith="Contrato renovado").exists()

    def test_logins_add_and_remove(self, session_client, workspace, existing_client_user):
        response = session_client.post(self._url(workspace), _payload(emails=[]), format="json")
        client_id = response.data["client"]["id"]
        project_id = response.data["project"]["id"]
        url = self._url(workspace, "workspace-pespo-client-logins", pk=client_id)
        response = session_client.post(url, {"emails": ["ana@acme.com"]}, format="json")
        assert response.data["logins"] == [{"email": "ana@acme.com", "status": "active"}]
        assert response.data["client"]["login_list"] == [{"email": "ana@acme.com", "status": "active"}]
        response = session_client.delete(url, {"email": "ana@acme.com"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert not PespoClientLogin.objects.exists()
        assert not ProjectMember.objects.filter(
            project_id=project_id, member=existing_client_user, is_active=True
        ).exists()

    def test_only_workspace_admins(self, workspace):
        member = User.objects.create(email="equipe@pespo.com.br", username="equipe")
        WorkspaceMember.objects.create(workspace=workspace, member=member, role=15)
        api = APIClient()
        api.force_authenticate(user=member)
        assert api.get(self._url(workspace)).status_code == status.HTTP_403_FORBIDDEN

    def test_identifier_suggestion_is_unique(self, workspace):
        Project.objects.create(name="Outro", identifier="EAA", workspace=workspace)
        assert suggest_identifier("Empresa A Alimentos", workspace.id) == "EAA2"
        assert suggest_identifier("Padaria", workspace.id) == "PADAR"
