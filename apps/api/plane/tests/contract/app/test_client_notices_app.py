# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: avisos ao cliente por e-mail (peça entregue, refação pronta, contrato vencendo)."""

from datetime import date, timedelta

import pytest
from django.core import mail
from rest_framework import status

from plane.bgtasks import pespo_client_notice_task
from plane.bgtasks.pespo_client_notice_task import send_client_notice
from plane.bgtasks.pespo_contract_task import contract_expiry_check
from plane.db.models import (
    ClientNotice,
    Issue,
    IssueLabel,
    Label,
    PespoClient,
    PespoContract,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Cliente Acme", identifier="ACME", workspace=workspace)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def guest(workspace, project):
    user = User.objects.create(email="ana@acme.com", username="ana_acme", first_name="Ana")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=5)
    ProjectMember.objects.create(project=project, member=user, role=5, is_active=True)
    return user


@pytest.fixture
def states(project):
    def make(name, group):
        return State.objects.create(name=name, group=group, project=project, workspace=project.workspace)

    return {
        "doing": make("Em Criacao", "started"),
        "rework": make("Reprovado Cliente - Retrabalho", "started"),
        "internal_rework": make("Reprovado Interno - Retrabalho", "started"),
        "waiting": make("Aguardando Aprovacao Cliente", "started"),
        "done": make("Entregue", "completed"),
    }


@pytest.fixture(autouse=True)
def smtp(monkeypatch):
    monkeypatch.setattr(
        pespo_client_notice_task,
        "get_email_configuration",
        lambda: ("smtp.local", "", "", "25", "0", "0", "Pespo Hub <hub@pespo.com.br>"),
    )


def _piece(project, state, category="Post"):
    issue = Issue.objects.create(name="Post de Natal", project=project, workspace=project.workspace, state=state)
    if category:
        label, _ = Label.objects.get_or_create(project=project, workspace=project.workspace, name=category)
        IssueLabel.objects.create(issue=issue, label=label, project=project, workspace=project.workspace)
    return issue


def _move(session_client, issue, state):
    url = f"/api/workspaces/{issue.workspace.slug}/projects/{issue.project_id}/issues/{issue.id}/"
    response = session_client.patch(url, {"state_id": str(state.id)}, format="json")
    assert response.status_code in (status.HTTP_200_OK, status.HTTP_204_NO_CONTENT)


@pytest.mark.contract
@pytest.mark.django_db
class TestClientNotices:
    def test_delivered_piece_emails_the_client(self, session_client, project, guest, states):
        piece = _piece(project, states["doing"])
        _move(session_client, piece, states["done"])
        notice = ClientNotice.objects.get(issue=piece)
        assert notice.kind == "delivered" and notice.status == "queued"
        assert send_client_notice(str(notice.id)) == "sent"
        assert len(mail.outbox) == 1
        message = mail.outbox[0]
        assert message.to == ["ana@acme.com"] and message.subject == "Peça entregue: Post de Natal"
        assert "ACME-" in message.alternatives[0][0] and "Olá, Ana!" in message.alternatives[0][0]
        notice.refresh_from_db()
        assert notice.recipients[0]["email"] == "ana@acme.com" and notice.sent_at is not None
        # o mesmo aviso não sai de novo logo depois (peça que volta e é entregue de novo)
        _move(session_client, piece, states["doing"])
        _move(session_client, piece, states["done"])
        assert ClientNotice.objects.filter(issue=piece).count() == 1

    def test_rework_done_only_after_client_rework(self, session_client, project, guest, states):
        piece = _piece(project, states["rework"])
        _move(session_client, piece, states["waiting"])
        assert ClientNotice.objects.get(issue=piece).kind == "rework_done"
        internal = _piece(project, states["internal_rework"])
        _move(session_client, internal, states["waiting"])
        assert not ClientNotice.objects.filter(issue=internal).exists()

    def test_tasks_and_disabled_projects_are_quiet(self, session_client, project, guest, states):
        task = _piece(project, states["doing"], category=None)
        _move(session_client, task, states["done"])
        assert not ClientNotice.objects.filter(issue=task).exists()
        project.client_notices = {"email": True, "events": {"delivered": False}}
        project.save()
        piece = _piece(project, states["doing"])
        _move(session_client, piece, states["done"])
        assert not ClientNotice.objects.filter(issue=piece).exists()

    def test_no_guest_is_skipped(self, session_client, project, states):
        piece = _piece(project, states["doing"])
        _move(session_client, piece, states["done"])
        notice = ClientNotice.objects.get(issue=piece)
        assert send_client_notice(str(notice.id)) == "skipped"
        assert mail.outbox == []

    def test_settings_are_validated(self, session_client, project):
        url = f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/"
        response = session_client.patch(url, {"client_notices": {"events": {"rework_done": False}}}, format="json")
        assert response.status_code == status.HTTP_200_OK
        project.refresh_from_db()
        assert project.client_notices == {
            "email": True,
            "events": {"delivered": True, "rework_done": False, "contract_expiring": True},
        }

    def test_contract_expiring_emails_the_client(self, project, guest, settings):
        settings.PESPO_CONTRACT_EXPIRY_ENABLED = True
        client = PespoClient.objects.create(workspace=project.workspace, name="Acme")
        client.projects.add(project)
        end = date.today() + timedelta(days=7)
        contract = PespoContract.objects.create(
            workspace=project.workspace, client=client, start_date=end - timedelta(days=90), end_date=end
        )
        contract_expiry_check()
        notice = ClientNotice.objects.get(kind="contract_expiring")
        assert notice.contract_id == contract.id
        assert send_client_notice(str(notice.id)) == "sent"
        assert mail.outbox[0].subject == f"Seu contrato com a Pespo vence em {end:%d/%m/%Y}"
