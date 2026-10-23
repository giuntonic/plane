# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the Pespo home widgets: widget config (size on the grid), the
"Tarefas" widget as a tree, quick links that point to a work item and the agenda
widget's choice of Google calendars."""

from datetime import timedelta
from unittest import mock

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.app.serializers import WorkspaceUserTaskSerializer
from plane.db.models import (
    GoogleCalendarConnection,
    Issue,
    Project,
    ProjectMember,
    State,
    User,
    Workspace,
    WorkspaceHomePreference,
    WorkspaceMember,
    WorkspaceUserTask,
)

GCAL = "plane.utils.google_calendar"


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Home Project", identifier="HOME", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def issue(db, project, create_user):
    state = State.objects.create(
        name="Em andamento", group="started", color="#f59e0b", project=project, workspace=project.workspace
    )
    return Issue.objects.create(
        name="Roteiro do vídeo", project=project, workspace=project.workspace, state=state, created_by=create_user
    )


@pytest.fixture
def guest(db, workspace):
    guest = User.objects.create(email="guest-home@plane.so", username="guest_home")
    WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
    return guest


def _client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _preferences_url(workspace, key=None):
    kwargs = {"slug": workspace.slug}
    if key:
        kwargs["key"] = key
    return reverse("workspace-home-preference", kwargs=kwargs)


def _tasks_url(workspace, pk=None):
    kwargs = {"slug": workspace.slug}
    if pk:
        kwargs["pk"] = pk
    return reverse("workspace-tasks", kwargs=kwargs)


def _links_url(workspace, pk=None):
    kwargs = {"slug": workspace.slug}
    if pk:
        kwargs["pk"] = pk
    return reverse("workspace-quick-links", kwargs=kwargs)


@pytest.mark.contract
class TestHomeWidgetPreferences:
    def test_first_visit_creates_every_widget_including_the_agenda(self, session_client, workspace):
        response = session_client.get(_preferences_url(workspace))
        assert response.status_code == status.HTTP_200_OK
        by_key = {widget["key"]: widget for widget in response.data}
        assert set(by_key) == {"quick_links", "recents", "my_stickies", "task_list", "google_calendar"}
        assert all(widget["is_enabled"] for widget in by_key.values())
        assert all(widget["config"] == {} for widget in by_key.values())

    def test_new_widget_goes_to_the_end_of_an_existing_home(self, session_client, workspace, create_user):
        for sort_order, key in [(5000, "quick_links"), (4000, "recents"), (3000, "my_stickies"), (2000, "task_list")]:
            WorkspaceHomePreference.objects.create(
                workspace=workspace, user=create_user, key=key, sort_order=sort_order
            )
        response = session_client.get(_preferences_url(workspace))
        sort_orders = {widget["key"]: widget["sort_order"] for widget in response.data}
        assert sort_orders["google_calendar"] < min(
            value for key, value in sort_orders.items() if key != "google_calendar"
        )

    def test_agenda_starts_disabled_for_guests(self, workspace, guest):
        response = _client_for(guest).get(_preferences_url(workspace))
        by_key = {widget["key"]: widget for widget in response.data}
        assert by_key["google_calendar"]["is_enabled"] is False
        assert by_key["task_list"]["is_enabled"] is True

    def test_config_is_saved(self, session_client, workspace):
        session_client.get(_preferences_url(workspace))
        response = session_client.patch(
            _preferences_url(workspace, "task_list"), {"config": {"w": 4, "h": 360}}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["config"] == {"w": 4, "h": 360}
        response = session_client.get(_preferences_url(workspace))
        assert {widget["key"]: widget["config"] for widget in response.data}["task_list"] == {"w": 4, "h": 360}

    def test_config_must_be_a_small_object(self, session_client, workspace):
        session_client.get(_preferences_url(workspace))
        response = session_client.patch(_preferences_url(workspace, "recents"), {"config": [1, 2]}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        response = session_client.patch(
            _preferences_url(workspace, "recents"), {"config": {"x": "a" * 3000}}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestHomeTaskTree:
    def _create(self, client, workspace, **data):
        response = client.post(_tasks_url(workspace), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data

    def test_create_tree_in_order(self, session_client, workspace):
        root = self._create(session_client, workspace, title="Briefing")
        child = self._create(session_client, workspace, title="Roteiro", parent=root["id"])
        second = self._create(session_client, workspace, title="Aprovação")

        assert child["parent"] == root["id"]
        assert second["sort_order"] > root["sort_order"]
        response = session_client.get(_tasks_url(workspace))
        assert [task["title"] for task in response.data] == ["Briefing", "Roteiro", "Aprovação"]

    def test_empty_title_is_allowed_while_typing(self, session_client, workspace):
        task = self._create(session_client, workspace, title="")
        assert task["title"] == ""

    def test_move_under_another_task_and_back_to_root(self, session_client, workspace):
        a = self._create(session_client, workspace, title="A")
        b = self._create(session_client, workspace, title="B")
        response = session_client.patch(
            _tasks_url(workspace, b["id"]), {"parent": a["id"], "sort_order": 100}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["parent"] == a["id"]
        assert response.data["sort_order"] == 100
        response = session_client.patch(_tasks_url(workspace, b["id"]), {"parent": None}, format="json")
        assert response.data["parent"] is None

    def test_two_patches_at_once_keep_both_fields(self, session_client, workspace):
        """Tab manda o texto e o recuo quase juntos; o PATCH do recuo, carregado antes do outro
        terminar, regravava a linha inteira e apagava o texto."""
        a = self._create(session_client, workspace, title="A")
        b = self._create(session_client, workspace, title="")
        stale = WorkspaceUserTask.objects.get(pk=b["id"])
        session_client.patch(_tasks_url(workspace, b["id"]), {"title": "B"}, format="json")
        serializer = WorkspaceUserTaskSerializer(stale, data={"sort_order": 5}, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(parent=WorkspaceUserTask.objects.get(pk=a["id"]))
        task = WorkspaceUserTask.objects.get(pk=b["id"])
        assert task.title == "B"
        assert str(task.parent_id) == str(a["id"])
        assert task.sort_order == 5

    def test_cannot_move_under_own_subtask(self, session_client, workspace):
        a = self._create(session_client, workspace, title="A")
        b = self._create(session_client, workspace, title="B", parent=a["id"])
        response = session_client.patch(_tasks_url(workspace, a["id"]), {"parent": b["id"]}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        response = session_client.patch(_tasks_url(workspace, a["id"]), {"parent": a["id"]}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_parent_must_be_my_own_task(self, session_client, workspace, guest):
        theirs = self._create(_client_for(guest), workspace, title="Deles")
        response = session_client.post(_tasks_url(workspace), {"title": "x", "parent": theirs["id"]}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_tasks_are_private(self, session_client, workspace, guest):
        self._create(session_client, workspace, title="Minha")
        response = _client_for(guest).get(_tasks_url(workspace))
        assert response.data == []

    def test_delete_takes_subtasks_with_it(self, session_client, workspace):
        a = self._create(session_client, workspace, title="A")
        b = self._create(session_client, workspace, title="B", parent=a["id"])
        self._create(session_client, workspace, title="C", parent=b["id"])
        response = session_client.delete(_tasks_url(workspace, a["id"]))
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert WorkspaceUserTask.all_objects.filter(workspace=workspace).count() == 0


@pytest.mark.contract
class TestWorkItemQuickLinks:
    def test_link_to_a_work_item(self, session_client, workspace, issue):
        response = session_client.post(_links_url(workspace), {"issue": str(issue.id)}, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["issue"] == issue.id
        assert response.data["url"].endswith(f"/{workspace.slug}/browse/HOME-{issue.sequence_id}/")
        assert response.data["issue_detail"]["name"] == "Roteiro do vídeo"
        assert response.data["issue_detail"]["project_identifier"] == "HOME"
        assert response.data["issue_detail"]["state_group"] == "started"

    def test_the_list_shows_the_current_name(self, session_client, workspace, issue):
        session_client.post(_links_url(workspace), {"issue": str(issue.id)}, format="json")
        Issue.objects.filter(pk=issue.pk).update(name="Roteiro (v2)")
        response = session_client.get(_links_url(workspace))
        assert response.status_code == status.HTTP_200_OK
        assert response.data[0]["issue_detail"]["name"] == "Roteiro (v2)"

    def test_same_work_item_only_once(self, session_client, workspace, issue):
        session_client.post(_links_url(workspace), {"issue": str(issue.id)}, format="json")
        response = session_client.post(_links_url(workspace), {"issue": str(issue.id)}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_work_item_from_another_workspace_is_refused(self, session_client, workspace, create_user):
        other = Workspace.objects.create(name="Other", owner=create_user, slug="other-workspace")
        other_project = Project.objects.create(name="Other", identifier="OTH", workspace=other, created_by=create_user)
        ProjectMember.objects.create(project=other_project, member=create_user, role=20, is_active=True)
        other_issue = Issue.objects.create(name="Outro", project=other_project, workspace=other)
        response = session_client.post(_links_url(workspace), {"issue": str(other_issue.id)}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_work_item_of_a_project_i_am_not_in_is_refused(self, workspace, issue, create_user):
        member = User.objects.create(email="member-home@plane.so", username="member_home")
        WorkspaceMember.objects.create(workspace=workspace, member=member, role=15)
        response = _client_for(member).post(_links_url(workspace), {"issue": str(issue.id)}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_losing_access_hides_the_work_item(self, session_client, workspace, issue, project, create_user):
        session_client.post(_links_url(workspace), {"issue": str(issue.id)}, format="json")
        ProjectMember.objects.filter(project=project, member=create_user).update(is_active=False)
        response = session_client.get(_links_url(workspace))
        assert response.data[0]["issue_detail"] is None

    def test_guest_sees_only_what_the_project_lets_guests_see(self, workspace, issue, project, guest):
        ProjectMember.objects.create(project=project, member=guest, role=5, is_active=True)
        Project.objects.filter(pk=project.pk).update(guest_view_all_features=False)
        response = _client_for(guest).post(_links_url(workspace), {"issue": str(issue.id)}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        Project.objects.filter(pk=project.pk).update(guest_view_all_features=True)
        response = _client_for(guest).post(_links_url(workspace), {"issue": str(issue.id)}, format="json")
        assert response.status_code == status.HTTP_201_CREATED

    def test_external_link_still_needs_a_url(self, session_client, workspace):
        response = session_client.post(_links_url(workspace), {"title": "Sem URL"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        response = session_client.post(_links_url(workspace), {"url": "https://pespo.com.br"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["issue"] is None
        assert response.data["issue_detail"] is None

    def test_switch_a_work_item_link_back_to_a_site(self, session_client, workspace, issue):
        link = session_client.post(_links_url(workspace), {"issue": str(issue.id)}, format="json").data
        response = session_client.patch(
            _links_url(workspace, link["id"]), {"issue": None, "url": "https://pespo.com.br"}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["issue"] is None
        assert response.data["url"] == "https://pespo.com.br"


@pytest.mark.contract
class TestAgendaCalendars:
    @pytest.fixture
    def connection(self, db, create_user):
        connection = GoogleCalendarConnection(user=create_user, google_email="me@gmail.com", plane_calendar_id="plane-cal")
        connection.access_token = "access"
        connection.refresh_token = "refresh"
        connection.token_expires_at = timezone.now() + timedelta(hours=1)
        connection.overlay_calendar_ids = ["plane-cal"]
        connection.save()
        return connection

    def test_widget_reads_the_calendars_it_asks_for(self, session_client, connection):
        meeting = {
            "id": "ev1",
            "summary": "Reunião de pauta",
            "start": {"dateTime": "2026-10-23T14:00:00-03:00"},
            "end": {"dateTime": "2026-10-23T15:00:00-03:00"},
            "hangoutLink": "https://meet.google.com/abc-defg-hij",
        }
        with mock.patch(f"{GCAL}.list_events", side_effect=lambda *args: [dict(meeting)]) as list_events:
            response = session_client.get(
                reverse("google-calendar-events"),
                {
                    "after": "2026-10-23T03:00:00Z",
                    "before": "2026-10-30T03:00:00Z",
                    "calendar_ids": "primary,team@group.calendar.google.com",
                },
            )
        assert response.status_code == status.HTTP_200_OK
        assert [call.args[1] for call in list_events.call_args_list] == [
            "primary",
            "team@group.calendar.google.com",
        ]
        assert response.data[0]["hangoutLink"] == "https://meet.google.com/abc-defg-hij"
        assert response.data[0]["calendar_id"] == "primary"

    def test_without_the_parameter_the_overlay_calendars_are_used(self, session_client, connection):
        with mock.patch(f"{GCAL}.list_events", return_value=[]) as list_events:
            session_client.get(reverse("google-calendar-events"), {"after": "2026-10-01", "before": "2026-10-31"})
        assert [call.args[1] for call in list_events.call_args_list] == ["plane-cal"]

    def test_not_connected_returns_nothing(self, session_client):
        response = session_client.get(
            reverse("google-calendar-events"),
            {"after": "2026-10-01", "before": "2026-10-31", "calendar_ids": "primary"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []
