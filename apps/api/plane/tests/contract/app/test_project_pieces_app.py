# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests (Pespo): client pieces panel (balance, reworks), piece requests and rework requests.
The portal database is never touched: ``get_project_contract`` is patched."""

from datetime import date, datetime, timedelta, timezone
from unittest import mock

import pytest
from django.urls import reverse
from django.utils import timezone as dj_timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Issue,
    IssueActivity,
    IssueComment,
    IssueLabel,
    Label,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)
from plane.utils.portal_contracts import PortalUnavailable

CONTRACT_PATH = "plane.app.views.project.pieces.get_project_contract"


def _contract(start=date(2026, 10, 1), kind="FEE", urgent_limit=2, **categories):
    return {
        "client_id": "c1",
        "client_name": "Cliente Teste",
        "contract": {
            "type": kind,
            "start_date": start,
            "end_date": start + timedelta(days=90),
            "urgent_limit": urgent_limit,
            "categories": [
                {"category": c, "contracted": q} for c, q in (categories or {"Post": 4, "Reels": 2}).items()
            ],
        },
        "expiring": {"end_date": date(2026, 11, 1), "status": "ativo", "days_left": 7},
    }


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Cliente", identifier="CLI", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def states(project):
    ws = project.workspace
    return {
        "queue": State.objects.create(
            name="Fila de Criacao", group="unstarted", project=project, workspace=ws, default=True
        ),
        "doing": State.objects.create(name="Em Criacao", group="started", project=project, workspace=ws),
        "rework_internal": State.objects.create(
            name="Reprovado Interno - Retrabalho", group="started", project=project, workspace=ws
        ),
        "rework_client": State.objects.create(
            name="Reprovado Cliente - Retrabalho", group="started", project=project, workspace=ws
        ),
        "done": State.objects.create(name="Entregue (Peca)", group="completed", project=project, workspace=ws),
        "cancelled": State.objects.create(name="Cancelada", group="cancelled", project=project, workspace=ws),
    }


@pytest.fixture
def labels(project):
    names = ["Post", "Reels", "Artigo", "Anuncio", "Urgente"]
    return {name: Label.objects.create(name=name, project=project, workspace=project.workspace) for name in names}


def _piece(project, state, *label_objs, created_at=None, **extra):
    issue = Issue.objects.create(name="Peça", project=project, workspace=project.workspace, state=state, **extra)
    for label in label_objs:
        IssueLabel.objects.create(issue=issue, label=label, project=project, workspace=project.workspace)
    if created_at:
        Issue.objects.filter(pk=issue.pk).update(created_at=created_at)
    return issue


def _panel_url(workspace, project):
    return reverse("project-pieces-panel", kwargs={"slug": workspace.slug, "project_id": project.id})


def _request_url(workspace, project):
    return reverse("project-pieces-request", kwargs={"slug": workspace.slug, "project_id": project.id})


def _rework_url(workspace, project, issue):
    return reverse(
        "project-issue-request-rework", kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id}
    )


@pytest.mark.contract
class TestPiecesPanel:
    def test_balance_counts_and_reworks(self, session_client, workspace, project, states, labels):
        before_contract = datetime(2026, 9, 15, tzinfo=timezone.utc)
        old = _piece(project, states["done"], labels["Post"], created_at=before_contract)  # contrato anterior
        Issue.objects.filter(pk=old.pk).update(completed_at=before_contract)
        _piece(project, states["doing"], labels["Post"])
        _piece(project, states["cancelled"], labels["Post"])  # cancelada não conta
        reels = _piece(project, states["rework_client"], labels["Reels"], labels["Urgente"])
        _piece(project, states["done"], labels["Reels"], completed_at=dj_timezone.now())
        Issue.objects.create(name="Onboarding", project=project, workspace=project.workspace, state=states["doing"])
        for state in (states["rework_internal"], states["rework_client"]):
            IssueActivity.objects.create(
                issue=reels,
                project=project,
                workspace=workspace,
                field="state",
                verb="updated",
                new_identifier=state.id,
                new_value=state.name,
            )

        with mock.patch(CONTRACT_PATH, return_value=_contract()):
            response = session_client.get(_panel_url(workspace, project))
        assert response.status_code == status.HTTP_200_OK, response.data
        data = response.data
        assert data["contract_status"] == "ok" and data["client_name"] == "Cliente Teste"
        categories = {row["category"]: row for row in data["availability"]["categories"]}
        assert categories["Post"] == {"category": "Post", "contracted": 4, "used": 1, "available": 3}
        assert categories["Reels"]["used"] == 2 and categories["Reels"]["available"] == 0
        assert data["availability"]["urgent"]["open_now"] == 1
        assert data["total_pieces"] == 5
        groups = {row["group"]: row["count"] for row in data["by_state_group"]}
        assert groups == {"backlog": 0, "unstarted": 0, "started": 2, "completed": 2, "cancelled": 1}
        assert len(data["delivered_this_month"]) == 1
        assert data["reworks"]["total"] == 2
        assert data["reworks"]["internal"] == 1 and data["reworks"]["client"] == 1
        assert [row["id"] for row in data["reworks"]["in_rework_now"]] == [str(reels.id)]
        assert data["expiring"]["days_left"] == 7

    def test_project_without_client(self, session_client, workspace, project, states):
        with mock.patch(CONTRACT_PATH, return_value=None):
            response = session_client.get(_panel_url(workspace, project))
        assert response.data["contract_status"] == "no_client"
        assert response.data["availability"]["categories"] == []

    def test_portal_unavailable_still_shows_pieces(self, session_client, workspace, project, states, labels):
        _piece(project, states["doing"], labels["Post"])
        with mock.patch(CONTRACT_PATH, side_effect=PortalUnavailable("down")):
            response = session_client.get(_panel_url(workspace, project))
        assert response.data["contract_status"] == "unavailable"
        assert response.data["total_pieces"] == 1


@pytest.mark.contract
class TestPieceRequests:
    def test_creates_pieces_in_the_queue(self, session_client, workspace, project, states, labels):
        payload = {
            "items": [
                {"category": "Post", "quantity": 2, "desired_date": "2026-11-20"},
                {"category": "Reels", "quantity": 1, "urgent": True, "needs_print": True},
            ],
            "briefing": "Campanha <de> Natal",
        }
        with mock.patch(CONTRACT_PATH, return_value=_contract()):
            response = session_client.post(_request_url(workspace, project), payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data
        created = Issue.issue_objects.filter(pk__in=response.data["created"])
        assert created.count() == 3
        assert set(created.values_list("state_id", flat=True)) == {states["queue"].id}
        posts = created.filter(label_issue__label=labels["Post"])
        assert posts.count() == 2 and all(p.target_date == date(2026, 11, 20) for p in posts)
        reels = created.get(label_issue__label=labels["Reels"])
        assert set(reels.labels.values_list("name", flat=True)) == {"Reels", "Urgente", "Precisa Impressao"}
        assert "&lt;de&gt;" in reels.description_html
        assert reels.name.startswith("Reels — solicitado por")

    def test_not_enough_balance(self, session_client, workspace, project, states, labels):
        with mock.patch(CONTRACT_PATH, return_value=_contract(Reels=1)):
            response = session_client.post(
                _request_url(workspace, project), {"items": [{"category": "Reels", "quantity": 2}]}, format="json"
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "NOT_ENOUGH"
        assert response.data["params"] == {"category": "Reels", "requested": 2, "available": 1}
        assert not Issue.issue_objects.filter(project=project).exists()

    def test_simultaneous_urgent_limit(self, session_client, workspace, project, states, labels):
        for _ in range(3):
            _piece(project, states["doing"], labels["Artigo"], labels["Urgente"])
        with mock.patch(CONTRACT_PATH, return_value=_contract(urgent_limit=10, Post=5)):
            response = session_client.post(
                _request_url(workspace, project),
                {"items": [{"category": "Post", "quantity": 1, "urgent": True}]},
                format="json",
            )
        assert response.data["code"] == "NOT_ENOUGH_URGENT"
        assert response.data["params"]["available"] == 0

    def test_guest_requests_are_named_as_client(self, workspace, project, states, labels):
        guest = User.objects.create(email="cliente@empresa.com", username="cliente_guest")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(project=project, member=guest, role=5, is_active=True)
        client = APIClient()
        client.force_authenticate(user=guest)
        with mock.patch(CONTRACT_PATH, return_value=_contract()):
            response = client.post(
                _request_url(workspace, project), {"items": [{"category": "Post", "quantity": 1}]}, format="json"
            )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert Issue.issue_objects.get(pk=response.data["created"][0]).name == "Post — solicitado pelo cliente"

    def test_limits_and_contract(self, session_client, workspace, project, states, labels):
        with mock.patch(CONTRACT_PATH, return_value=_contract()):
            too_many = session_client.post(
                _request_url(workspace, project), {"items": [{"category": "Post", "quantity": 51}]}, format="json"
            )
            empty = session_client.post(
                _request_url(workspace, project), {"items": [{"category": "Banner", "quantity": 1}]}, format="json"
            )
        assert too_many.data["code"] == "EMPTY_REQUEST"  # linha acima de 50 é descartada
        assert empty.data["code"] == "EMPTY_REQUEST"
        with mock.patch(CONTRACT_PATH, return_value=None):
            no_contract = session_client.post(
                _request_url(workspace, project), {"items": [{"category": "Post", "quantity": 1}]}, format="json"
            )
        assert no_contract.data["code"] == "NO_ACTIVE_CONTRACT"
        payload = {"items": [{"category": "Post", "quantity": 20}, {"category": "Reels", "quantity": 11}]}
        with mock.patch(CONTRACT_PATH, return_value=_contract()):
            over = session_client.post(_request_url(workspace, project), payload, format="json")
        assert over.data["code"] == "TOO_MANY_PIECES"


@pytest.mark.contract
class TestReworkRequests:
    def test_moves_to_client_rework_and_comments(self, session_client, workspace, project, states, labels):
        piece = _piece(project, states["doing"], labels["Post"])
        response = session_client.post(
            _rework_url(workspace, project, piece), {"reason": "Trocar a foto"}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        piece.refresh_from_db()
        assert piece.state_id == states["rework_client"].id
        comment = IssueComment.objects.get(issue=piece)
        assert "Refação pedida por" in comment.comment_html and "Trocar a foto" in comment.comment_html

    def test_reason_is_required(self, session_client, workspace, project, states, labels):
        piece = _piece(project, states["doing"], labels["Post"])
        response = session_client.post(_rework_url(workspace, project, piece), {"reason": " "}, format="json")
        assert response.data["code"] == "REASON_REQUIRED"

    def test_guest_without_view_all_cannot_touch_others_pieces(self, workspace, project, states, labels):
        guest = User.objects.create(email="cliente2@empresa.com", username="cliente2_guest")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(project=project, member=guest, role=5, is_active=True)
        client = APIClient()
        client.force_authenticate(user=guest)
        piece = _piece(project, states["doing"], labels["Post"])
        response = client.post(_rework_url(workspace, project, piece), {"reason": "x"}, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

        project.guest_view_all_features = True
        project.save()
        response = client.post(_rework_url(workspace, project, piece), {"reason": "x"}, format="json")
        assert response.status_code == status.HTTP_200_OK
