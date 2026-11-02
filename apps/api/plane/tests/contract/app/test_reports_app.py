# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: relatórios (mês do cliente e carga da equipe)."""

from datetime import timedelta
from zoneinfo import ZoneInfo

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Issue,
    IssueAssignee,
    IssueCalendarEvent,
    IssueChecklistItem,
    IssueLabel,
    IssueTimeEntry,
    Label,
    PieceApproval,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Cliente", identifier="CLI", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


def _state(project, name, group):
    return State.objects.create(name=name, group=group, project=project, workspace=project.workspace)


def _piece(project, name, state, category=None, **fields):
    issue = Issue.objects.create(name=name, project=project, workspace=project.workspace, state=state, **fields)
    if category:
        label, _ = Label.objects.get_or_create(project=project, workspace=project.workspace, name=category)
        IssueLabel.objects.create(issue=issue, label=label, project=project, workspace=project.workspace)
    return issue


@pytest.mark.contract
@pytest.mark.django_db
class TestMonthlyReport:
    def test_month_of_a_client(self, session_client, workspace, project, create_user):
        done = _state(project, "Concluída", "completed")
        doing = _state(project, "Em produção", "started")
        now = timezone.now()
        today = timezone.localdate()
        on_time = _piece(project, "Post 1", done, "Post", target_date=today + timedelta(days=1))
        late = _piece(project, "Reels 1", done, "Reels", target_date=today - timedelta(days=40))
        Issue.objects.filter(pk__in=[on_time.pk, late.pk]).update(completed_at=now)
        _piece(project, "Artigo", doing, "Artigo")
        _piece(project, "Tarefa interna", doing)
        IssueTimeEntry.objects.create(
            issue=on_time,
            project=project,
            workspace=workspace,
            user=create_user,
            started_at=now - timedelta(hours=1),
            ended_at=now,
            duration_seconds=3600,
            source="manual",
        )
        IssueCalendarEvent.objects.create(
            issue=on_time,
            project=project,
            workspace=workspace,
            google_event_id="g1",
            calendar_id="primary",
            summary="Alinhamento",
            start=now,
            end=now + timedelta(hours=1),
        )
        # a mesma peça aprovada pela revisão e pela mudança de estado conta uma vez
        for source in (PieceApproval.SOURCE_REVIEW, PieceApproval.SOURCE_STATE):
            PieceApproval.objects.create(
                issue=on_time, project=project, approved_by=create_user, approved_by_role="client", source=source
            )
        url = reverse("project-monthly-report", kwargs={"slug": workspace.slug, "project_id": project.id})
        response = session_client.get(url, {"month": now.astimezone(ZoneInfo("America/Sao_Paulo")).strftime("%Y-%m")})
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data["pieces"]["delivered_total"] == 2
        assert data["pieces"]["on_time"] == 1 and data["pieces"]["with_due_date"] == 2
        assert data["pieces"]["open_now"]["started"] == 1  # a tarefa sem categoria não é peça
        assert data["pieces"]["requested_total"] == 3
        assert data["hours"]["total_seconds"] == 3600
        assert data["meetings"]["items"][0]["summary"] == "Alinhamento"
        assert data["approvals"]["total"] == 1 and data["approvals"]["by_client"] == 1
        assert data["approvals"]["items"][0]["name"] == "Post 1"
        assert data["contract_status"] in ("unavailable", "no_client")

    def test_guest_cannot_open(self, workspace, project):
        guest = User.objects.create(email="cliente@plane.so", username="cliente")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(project=project, member=guest, role=5, is_active=True)
        client = APIClient()
        client.force_authenticate(user=guest)
        url = reverse("project-monthly-report", kwargs={"slug": workspace.slug, "project_id": project.id})
        assert client.get(url).status_code == status.HTTP_403_FORBIDDEN
        assert client.get(reverse("workspace-workload", kwargs={"slug": workspace.slug})).status_code == 403


@pytest.mark.contract
@pytest.mark.django_db
class TestWorkload:
    def test_team_workload(self, session_client, workspace, project, create_user):
        doing = _state(project, "Em produção", "started")
        todo = _state(project, "A fazer", "unstarted")
        done = _state(project, "Concluída", "completed")
        today = timezone.localdate()
        overdue = _piece(project, "Atrasado", doing, target_date=today - timedelta(days=2))
        soon = _piece(project, "Vence logo", todo, target_date=today + timedelta(days=3))
        finished = _piece(project, "Pronto", done, target_date=today - timedelta(days=1))
        for issue in (overdue, soon, finished):
            IssueAssignee.objects.create(issue=issue, assignee=create_user, project=project, workspace=workspace)
        IssueChecklistItem.objects.create(
            issue=soon, project=project, name="Revisar", assignee=create_user, due_date=today - timedelta(days=1)
        )
        now = timezone.now()
        IssueTimeEntry.objects.create(
            issue=soon,
            project=project,
            workspace=workspace,
            user=create_user,
            started_at=now - timedelta(minutes=30),
            ended_at=now,
            duration_seconds=1800,
            source="manual",
        )
        response = session_client.get(reverse("workspace-workload", kwargs={"slug": workspace.slug}))
        assert response.status_code == status.HTTP_200_OK
        row = next(p for p in response.data["people"] if p["id"] == str(create_user.id))
        assert (row["open"], row["started"], row["overdue"], row["due_soon"]) == (2, 1, 1, 1)
        assert (row["subtasks_open"], row["subtasks_overdue"]) == (1, 1)
        assert row["week_seconds"] in (0, 1800)  # 0 só se o teste rodar na virada da semana
        assert row["projects"] == [{"identifier": "CLI", "count": 2}]
        assert [u["name"] for u in row["upcoming"]] == ["Atrasado", "Vence logo"]
        bad = session_client.get(reverse("workspace-workload", kwargs={"slug": workspace.slug}), {"project": "x"})
        assert bad.status_code == status.HTTP_400_BAD_REQUEST
