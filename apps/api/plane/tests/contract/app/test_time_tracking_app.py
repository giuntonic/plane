# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: tempo gasto por peça (…/issues/<id>/time-entries/…), o cronômetro de quem está logado, o total
nos extras dos cards e o cronômetro esquecido."""

from datetime import timedelta
from zoneinfo import ZoneInfo

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Issue, IssueTimeEntry, Project, ProjectMember, State, User, WorkspaceMember
from plane.utils.time_tracking import AUTO_STOP_SECONDS, stop_forgotten_entries


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Tempo", identifier="TMP", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def state(db, project):
    return State.objects.create(name="Todo", group="unstarted", project=project, workspace=project.workspace)


@pytest.fixture
def issue(db, project, state):
    return Issue.objects.create(name="Post", project=project, workspace=project.workspace, state=state)


def _client(workspace, project, role, email):
    user = User.objects.create(email=email, username=email.split("@")[0], display_name=email.split("@")[0])
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    ProjectMember.objects.create(project=project, member=user, role=role, is_active=True)
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


def _url(name, issue, **kwargs):
    return reverse(
        name, kwargs={"slug": issue.workspace.slug, "project_id": issue.project_id, "issue_id": issue.id, **kwargs}
    )


def _running_url(workspace):
    return reverse("workspace-running-time-entry", kwargs={"slug": workspace.slug})


@pytest.mark.contract
class TestTimer:
    def test_start_stop_and_total(self, session_client, issue, workspace, create_user):
        response = session_client.post(_url("project-issue-time-entry-start", issue))
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["is_running"] is True
        assert response.data["issue_name"] == "Post"

        # o cronômetro começou há 30 min
        entry = IssueTimeEntry.objects.get(pk=response.data["id"])
        entry.started_at = timezone.now() - timedelta(minutes=30)
        entry.save()

        running = session_client.get(_running_url(workspace))
        assert running.data["running"]["id"] == str(entry.id)

        stopped = session_client.post(_running_url(workspace))
        assert stopped.status_code == status.HTTP_200_OK
        assert 1795 <= stopped.data["stopped"]["duration_seconds"] <= 1805
        assert session_client.get(_running_url(workspace)).data["running"] is None

        listed = session_client.get(_url("project-issue-time-entries", issue))
        assert listed.status_code == status.HTTP_200_OK
        assert 1795 <= listed.data["total_seconds"] <= 1805
        assert listed.data["entries"][0]["user"] == str(create_user.id)

    def test_starting_another_timer_asks_first(self, session_client, issue, project, state):
        other = Issue.objects.create(name="Reels", project=project, workspace=project.workspace, state=state)
        first = session_client.post(_url("project-issue-time-entry-start", issue)).data

        conflict = session_client.post(_url("project-issue-time-entry-start", other), {}, format="json")
        assert conflict.status_code == status.HTTP_409_CONFLICT
        assert conflict.data["error"] == "TIMER_ALREADY_RUNNING"
        assert conflict.data["running"]["id"] == first["id"]
        assert conflict.data["running"]["issue_name"] == issue.name
        assert IssueTimeEntry.objects.get(pk=first["id"]).ended_at is None

        second = session_client.post(_url("project-issue-time-entry-start", other), {"replace": True}, format="json")
        assert second.status_code == status.HTTP_201_CREATED
        assert second.data["stopped"]["id"] == first["id"]
        assert IssueTimeEntry.objects.filter(ended_at__isnull=True).count() == 1
        assert IssueTimeEntry.objects.get(pk=first["id"]).ended_at is not None

    def test_starting_the_running_item_again_keeps_it(self, session_client, issue):
        first = session_client.post(_url("project-issue-time-entry-start", issue)).data
        again = session_client.post(_url("project-issue-time-entry-start", issue))
        assert again.status_code == status.HTTP_200_OK
        assert again.data["id"] == first["id"]
        assert IssueTimeEntry.objects.count() == 1

    def test_forgotten_timer_stops_at_the_limit(self, session_client, issue):
        entry_id = session_client.post(_url("project-issue-time-entry-start", issue)).data["id"]
        IssueTimeEntry.objects.filter(pk=entry_id).update(started_at=timezone.now() - timedelta(hours=30))
        assert stop_forgotten_entries() == 1
        entry = IssueTimeEntry.objects.get(pk=entry_id)
        assert entry.duration_seconds == AUTO_STOP_SECONDS
        assert entry.source == "auto_stopped"


@pytest.mark.contract
class TestEntries:
    def test_manual_entry_edit_and_delete(self, session_client, issue):
        url = _url("project-issue-time-entries", issue)
        created = session_client.post(
            url, {"duration_seconds": 5400, "date": "2026-10-30", "note": "Roteiro"}, format="json"
        )
        assert created.status_code == status.HTTP_201_CREATED, created.data
        assert created.data["source"] == "manual"
        assert created.data["duration_seconds"] == 5400
        assert created.data["started_at"].date().isoformat() == "2026-10-30"

        detail = _url("project-issue-time-entry-detail", issue, pk=created.data["id"])
        edited = session_client.patch(detail, {"duration_seconds": 3600, "note": "Roteiro e captação"}, format="json")
        assert edited.data["duration_seconds"] == 3600
        assert edited.data["note"] == "Roteiro e captação"
        assert edited.data["ended_at"] - edited.data["started_at"] == timedelta(hours=1)

        assert session_client.delete(detail).status_code == status.HTTP_204_NO_CONTENT
        assert not IssueTimeEntry.objects.exists()

    @pytest.mark.parametrize(
        "payload", [{}, {"duration_seconds": 30}, {"duration_seconds": 90000}, {"duration_seconds": "x"}]
    )
    def test_invalid_duration(self, session_client, issue, payload):
        response = session_client.post(_url("project-issue-time-entries", issue), payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_only_author_or_admin_changes(self, session_client, issue, workspace, project):
        created = session_client.post(
            _url("project-issue-time-entries", issue), {"duration_seconds": 600}, format="json"
        )
        member, _ = _client(workspace, project, 15, "membro-tempo@plane.so")
        detail = _url("project-issue-time-entry-detail", issue, pk=created.data["id"])
        assert member.patch(detail, {"note": "x"}, format="json").status_code == status.HTTP_403_FORBIDDEN
        assert member.delete(detail).status_code == status.HTTP_403_FORBIDDEN
        # o membro lança o próprio tempo
        own = member.post(_url("project-issue-time-entries", issue), {"duration_seconds": 600}, format="json")
        assert own.status_code == status.HTTP_201_CREATED


@pytest.mark.contract
class TestClientVisibility:
    def test_guest_sees_only_the_total_when_enabled(self, session_client, issue, workspace, project):
        session_client.post(_url("project-issue-time-entries", issue), {"duration_seconds": 7200}, format="json")
        guest, _ = _client(workspace, project, 5, "cliente-tempo@plane.so")
        url = _url("project-issue-time-entries", issue)
        extras_url = reverse("project-card-extras", kwargs={"slug": workspace.slug, "project_id": project.id})

        assert guest.get(url).status_code == status.HTTP_403_FORBIDDEN
        assert "time" not in guest.get(extras_url).data.get(str(issue.id), {})
        assert guest.post(_url("project-issue-time-entry-start", issue)).status_code == status.HTTP_403_FORBIDDEN

        project.time_tracking_client_visible = True
        project.save()
        response = guest.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_seconds"] == 7200
        assert response.data["entries"] is None
        assert guest.get(extras_url).data[str(issue.id)]["time"] == 7200

    def test_team_sees_time_in_card_extras(self, session_client, issue, workspace, project):
        session_client.post(_url("project-issue-time-entries", issue), {"duration_seconds": 900}, format="json")
        extras_url = reverse("project-card-extras", kwargs={"slug": workspace.slug, "project_id": project.id})
        assert session_client.get(extras_url).data[str(issue.id)]["time"] == 900

    def test_other_project_cannot_reach_issue(self, issue, workspace, create_user):
        other = Project.objects.create(name="Outro", identifier="OTR", workspace=workspace, created_by=create_user)
        outsider = User.objects.create(email="fora-tempo@plane.so", username="fora_tempo")
        WorkspaceMember.objects.create(workspace=workspace, member=outsider, role=15)
        ProjectMember.objects.create(project=other, member=outsider, role=20, is_active=True)
        client = APIClient()
        client.force_authenticate(user=outsider)
        kwargs = {"slug": workspace.slug, "project_id": other.id, "issue_id": issue.id}
        assert client.get(reverse("project-issue-time-entries", kwargs=kwargs)).status_code == status.HTTP_404_NOT_FOUND
        assert (
            client.post(reverse("project-issue-time-entry-start", kwargs=kwargs)).status_code
            == status.HTTP_404_NOT_FOUND
        )


def _period():
    # ontem e hoje no fuso do espaço de trabalho: um lançamento de 1 h atrás cai dentro em qualquer horário
    today = timezone.now().astimezone(ZoneInfo("America/Sao_Paulo")).date()
    return {"start": today - timedelta(days=1), "end": today}


def _report_url(workspace, export=False):
    name = "workspace-time-report-export" if export else "workspace-time-report"
    return reverse(name, kwargs={"slug": workspace.slug})


def _entry(issue, user, hours_ago, seconds, note=""):
    started = timezone.now() - timedelta(hours=hours_ago)
    return IssueTimeEntry.objects.create(
        issue=issue,
        project=issue.project,
        workspace=issue.workspace,
        user=user,
        started_at=started,
        ended_at=started + timedelta(seconds=seconds),
        duration_seconds=seconds,
        note=note,
        source=IssueTimeEntry.Source.MANUAL,
    )


@pytest.mark.contract
@pytest.mark.django_db
class TestTimeReport:
    def test_admin_sees_everyone_grouped(self, session_client, workspace, project, issue, create_user):
        _, member = _client(workspace, project, 15, "editor@plane.so")
        _entry(issue, create_user, 1, 3600)
        _entry(issue, member, 1, 1800)
        response = session_client.get(_report_url(workspace), _period())
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_admin"] is True
        assert response.data["total_seconds"] == 5400
        assert [row["seconds"] for row in response.data["by_user"]] == [3600, 1800]
        assert response.data["by_project"][0]["identifier"] == "TMP"
        assert response.data["by_issue"][0]["users"] == sorted([str(create_user.id), str(member.id)])

        only_member = session_client.get(_report_url(workspace), {**_period(), "user": member.id})
        assert only_member.data["total_seconds"] == 1800

    def test_member_sees_only_their_own_hours(self, workspace, project, issue, create_user):
        client, member = _client(workspace, project, 15, "editor2@plane.so")
        _entry(issue, create_user, 1, 3600)
        _entry(issue, member, 1, 600)
        response = client.get(_report_url(workspace), {**_period(), "user": create_user.id})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_admin"] is False
        assert response.data["total_seconds"] == 600

    def test_guest_cannot_open_the_report(self, workspace, project):
        client, _ = _client(workspace, project, 5, "cliente@plane.so")
        assert client.get(_report_url(workspace)).status_code == status.HTTP_403_FORBIDDEN
        assert client.get(_report_url(workspace, export=True)).status_code == status.HTTP_403_FORBIDDEN

    def test_period_and_filters_are_checked(self, session_client, workspace):
        assert (
            session_client.get(_report_url(workspace), {"start": "2026-02-01", "end": "2026-01-01"}).status_code == 400
        )
        assert (
            session_client.get(_report_url(workspace), {"start": "2024-01-01", "end": "2026-01-01"}).status_code == 400
        )
        assert session_client.get(_report_url(workspace), {"project": "nope"}).status_code == 400

    def test_csv_export(self, session_client, workspace, issue, create_user):
        _entry(issue, create_user, 1, 5400, note="=HYPERLINK(1)")
        response = session_client.get(_report_url(workspace, export=True), _period())
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"].startswith("text/csv")
        assert "attachment;" in response["Content-Disposition"]
        lines = response.content.decode("utf-8").lstrip("﻿").strip().splitlines()
        assert lines[0].startswith("Data;Pessoa;E-mail;Projeto;Item")
        row = lines[1].split(";")
        assert row[4] == f"TMP-{issue.sequence_id}"
        assert row[8] == "1:30" and row[9] == "1,50"
        assert row[11] == "'=HYPERLINK(1)"
