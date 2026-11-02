# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: aprovação de peças no Hub: a trava ao mudar para "Aprovada - Pronta pra Ativar" com bloqueio aberto
e o registro de cada aprovação."""

import pytest
from rest_framework import status

from plane.db.models import Issue, IssueComment, IssueRelation, PieceApproval, Project, ProjectMember, State
from plane.db.models.piece_approval import normalize_state_name


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Cliente", identifier="CLI", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


def _state(project, name, group="started"):
    return State.objects.create(name=name, group=group, project=project, workspace=project.workspace)


@pytest.fixture
def states(project):
    return {
        "waiting": _state(project, "Aguardando Aprovacao Cliente"),
        "approved": _state(project, "Aprovada - Pronta pra Ativar"),
        "todo": _state(project, "Fila de Criacao", "unstarted"),
        "done": _state(project, "Concluida", "completed"),
    }


def _issue(project, name, state):
    return Issue.objects.create(name=name, project=project, workspace=project.workspace, state=state)


def _url(issue):
    return f"/api/workspaces/{issue.workspace.slug}/projects/{issue.project_id}/issues/{issue.id}/"


def test_state_names_are_compared_without_accents_or_dash_style():
    assert normalize_state_name("Aprovada – Pronta pra Ativar") == "aprovada - pronta pra ativar"
    assert normalize_state_name("  APROVADA -  Pronta  pra ativar ") == "aprovada - pronta pra ativar"


@pytest.mark.contract
@pytest.mark.django_db
class TestPieceApproval:
    def test_open_blocker_refuses_the_approval(self, session_client, project, states):
        piece = _issue(project, "Post de Natal", states["waiting"])
        meeting = _issue(project, "Reunião de aprovação", states["todo"])
        IssueRelation.objects.create(
            issue=piece, related_issue=meeting, relation_type="blocked_by", project=project, workspace=project.workspace
        )
        response = session_client.patch(_url(piece), {"state_id": str(states["approved"].id)}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"] == "APPROVAL_BLOCKED"
        assert response.data["blockers"][0]["name"] == "Reunião de aprovação"
        piece.refresh_from_db()
        assert piece.state_id == states["waiting"].id
        assert not PieceApproval.objects.exists()

    def test_approval_goes_through_and_is_recorded(self, session_client, project, states, create_user):
        piece = _issue(project, "Post de Natal", states["waiting"])
        meeting = _issue(project, "Reunião de aprovação", states["done"])
        IssueRelation.objects.create(
            issue=piece, related_issue=meeting, relation_type="blocked_by", project=project, workspace=project.workspace
        )
        response = session_client.patch(_url(piece), {"state_id": str(states["approved"].id)}, format="json")
        assert response.status_code in (status.HTTP_200_OK, status.HTTP_204_NO_CONTENT)
        approval = PieceApproval.objects.get(issue=piece)
        assert approval.approved_by_id == create_user.id
        assert approval.approved_by_role == "team"
        assert approval.source == PieceApproval.SOURCE_STATE
        # outras mudanças não gravam aprovação
        session_client.patch(_url(piece), {"name": "Post de Natal v2"}, format="json")
        assert PieceApproval.objects.count() == 1

    def test_blocking_in_the_other_direction_does_not_count(self, session_client, project, states):
        # a peça bloqueia outro item (não é bloqueada por ele)
        piece = _issue(project, "Post de Natal", states["waiting"])
        other = _issue(project, "Impressão", states["todo"])
        IssueRelation.objects.create(
            issue=other, related_issue=piece, relation_type="blocked_by", project=project, workspace=project.workspace
        )
        response = session_client.patch(_url(piece), {"state_id": str(states["approved"].id)}, format="json")
        assert response.status_code in (status.HTTP_200_OK, status.HTTP_204_NO_CONTENT)

    def test_system_changes_are_not_blocked(self, project, states):
        piece = _issue(project, "Post de Natal", states["waiting"])
        meeting = _issue(project, "Reunião de aprovação", states["todo"])
        IssueRelation.objects.create(
            issue=piece, related_issue=meeting, relation_type="blocked_by", project=project, workspace=project.workspace
        )
        piece.state = states["approved"]
        piece.save()
        assert PieceApproval.objects.filter(issue=piece, approved_by__isnull=True).count() == 1

    def test_review_approve_button_comment_is_recorded(self, session_client, project, states, create_user):
        # o botão "Aprovar peça" da revisão posta este comentário fixo
        piece = _issue(project, "Post de Natal", states["waiting"])
        url = f"/api/workspaces/{piece.workspace.slug}/projects/{project.id}/issues/{piece.id}/comments/"
        response = session_client.post(
            url, {"comment_html": "<p>✅ Peça aprovada por Ana &amp; Bia em 02/11/2026</p>"}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        approval = PieceApproval.objects.get(issue=piece)
        assert approval.source == PieceApproval.SOURCE_REVIEW
        assert approval.approved_by_id == create_user.id
        assert approval.approved_by_role == "team"
        # comentário comum não conta, nem editar o de aprovação
        session_client.post(url, {"comment_html": "<p>Ficou ótimo, a peça aprovada por mim depois</p>"}, format="json")
        comment = IssueComment.objects.get(issue=piece, comment_stripped__startswith="✅")
        comment.comment_html = "<p>✅ Peça aprovada por Ana em 03/11/2026</p>"
        comment.save()
        assert PieceApproval.objects.count() == 1

    def test_team_approves_on_behalf_of_the_client(self, session_client, project, states, create_user):
        piece = _issue(project, "Post de Natal", states["waiting"])
        url = f"/api/workspaces/{piece.workspace.slug}/projects/{project.id}/issues/{piece.id}/comments/"
        text = "✅ Peça aprovada por Cliente (via WhatsApp, lançado por Giuliano) em 02/11/2026"
        response = session_client.post(url, {"comment_html": f"<p>{text}</p>"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        approval = PieceApproval.objects.get(issue=piece)
        assert approval.on_behalf_of_client and approval.channel == "WhatsApp"
        assert approval.approved_by_id == create_user.id and approval.approved_by_role == "team"
