# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models import Dashboard, DashboardWidget, Issue, Project, ProjectMember, State, User, WorkspaceMember


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Test Project", identifier="TP", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def guest_client(api_client, workspace):
    guest = User.objects.create(email="guest@plane.so", username="guest_user", first_name="Guest", last_name="User")
    WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
    api_client.force_authenticate(user=guest)
    return api_client


@pytest.mark.contract
class TestWorkspaceDashboardCrud:
    @pytest.mark.django_db
    def test_admin_can_create_workspace_dashboard(self, session_client, workspace):
        url = reverse("workspace-dashboard", kwargs={"slug": workspace.slug})
        response = session_client.post(url, {"name": "Engineering overview"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["dashboard_type"] == Dashboard.DashboardType.WORKSPACE
        assert response.data["project"] is None

    @pytest.mark.django_db
    def test_guest_cannot_create_workspace_dashboard(self, guest_client, workspace):
        url = reverse("workspace-dashboard", kwargs={"slug": workspace.slug})
        response = guest_client.post(url, {"name": "Not allowed"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_guest_can_list_workspace_dashboards(self, guest_client, session_client, workspace):
        create_url = reverse("workspace-dashboard", kwargs={"slug": workspace.slug})
        session_client.post(create_url, {"name": "Engineering overview"}, format="json")

        response = guest_client.get(create_url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

    @pytest.mark.django_db
    def test_list_excludes_project_dashboards(self, session_client, workspace, project):
        workspace_dashboard = Dashboard.objects.create(workspace=workspace, name="Workspace dashboard")
        Dashboard.objects.create(
            project=project, name="Project dashboard", dashboard_type=Dashboard.DashboardType.PROJECT
        )

        url = reverse("workspace-dashboard", kwargs={"slug": workspace.slug})
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert [d["id"] for d in response.data] == [workspace_dashboard.id]

    @pytest.mark.django_db
    def test_home_dashboard_is_private_to_its_owner(self, session_client, workspace, create_user):
        other_user = User.objects.create(email="other@plane.so", username="other_user")
        WorkspaceMember.objects.create(workspace=workspace, member=other_user, role=15)
        Dashboard.objects.create(
            workspace=workspace,
            name="Other user's home dashboard",
            dashboard_type=Dashboard.DashboardType.HOME,
            owned_by=other_user,
        )

        url = reverse("workspace-dashboard", kwargs={"slug": workspace.slug})
        response = session_client.get(url, {"dashboard_type": "home"})

        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    @pytest.mark.django_db
    def test_create_home_dashboard_sets_owner_to_requesting_user(self, session_client, workspace, create_user):
        url = reverse("workspace-dashboard", kwargs={"slug": workspace.slug})
        response = session_client.post(url, {"name": "My dashboard", "dashboard_type": "home"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["owned_by"] == create_user.id

    @pytest.mark.django_db
    def test_create_project_dashboard_via_project_scoped_url(self, session_client, workspace, project):
        url = reverse("project-dashboard", kwargs={"slug": workspace.slug, "project_id": project.id})
        response = session_client.post(url, {"name": "Project dashboard"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["dashboard_type"] == Dashboard.DashboardType.PROJECT
        assert response.data["project"] == project.id


@pytest.mark.contract
class TestDashboardWidgetCrud:
    @pytest.mark.django_db
    def test_create_and_list_widgets(self, session_client, workspace):
        dashboard = Dashboard.objects.create(workspace=workspace, name="Engineering overview")

        create_url = reverse("dashboard-widget", kwargs={"slug": workspace.slug, "dashboard_id": dashboard.id})
        response = session_client.post(
            create_url,
            {"name": "Work items by state", "chart_type": "bar-chart", "x_axis": "STATE_GROUPS"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED

        list_response = session_client.get(create_url)
        assert list_response.status_code == status.HTTP_200_OK
        assert len(list_response.data) == 1
        assert list_response.data[0]["dashboard"] == dashboard.id

    @pytest.mark.django_db
    def test_update_widget_layout(self, session_client, workspace):
        dashboard = Dashboard.objects.create(workspace=workspace, name="Engineering overview")
        widget = DashboardWidget.objects.create(
            dashboard=dashboard, chart_type=DashboardWidget.ChartType.BAR, x_axis="PRIORITY"
        )

        url = reverse(
            "dashboard-widget", kwargs={"slug": workspace.slug, "dashboard_id": dashboard.id, "pk": widget.id}
        )
        response = session_client.patch(url, {"layout": {"x": 4, "y": 0, "w": 4, "h": 4}}, format="json")

        assert response.status_code == status.HTTP_200_OK
        widget.refresh_from_db()
        assert widget.layout == {"x": 4, "y": 0, "w": 4, "h": 4}

    @pytest.mark.django_db
    def test_cannot_create_widget_on_another_users_home_dashboard(self, session_client, workspace, create_user):
        other_user = User.objects.create(email="other2@plane.so", username="other_user_2")
        WorkspaceMember.objects.create(workspace=workspace, member=other_user, role=15)
        other_home_dashboard = Dashboard.objects.create(
            workspace=workspace,
            name="Other user's home dashboard",
            dashboard_type=Dashboard.DashboardType.HOME,
            owned_by=other_user,
        )

        url = reverse("dashboard-widget", kwargs={"slug": workspace.slug, "dashboard_id": other_home_dashboard.id})
        response = session_client.post(url, {"chart_type": "bar-chart", "x_axis": "PRIORITY"}, format="json")

        assert response.status_code in (status.HTTP_404_NOT_FOUND, status.HTTP_400_BAD_REQUEST)


@pytest.mark.contract
class TestDashboardWidgetChart:
    @pytest.mark.django_db
    def test_chart_groups_issues_by_state_group(self, session_client, workspace, project, create_user):
        started_state = State.objects.create(name="In Progress", project=project, workspace=workspace, group="started")
        backlog_state = State.objects.create(name="Backlog", project=project, workspace=workspace, group="backlog")

        Issue.objects.create(
            name="Issue 1", workspace=workspace, project=project, state=started_state, created_by=create_user
        )
        Issue.objects.create(
            name="Issue 2", workspace=workspace, project=project, state=started_state, created_by=create_user
        )
        Issue.objects.create(
            name="Issue 3", workspace=workspace, project=project, state=backlog_state, created_by=create_user
        )

        dashboard = Dashboard.objects.create(workspace=workspace, name="Engineering overview")
        widget = DashboardWidget.objects.create(
            dashboard=dashboard, chart_type=DashboardWidget.ChartType.BAR, x_axis="STATE_GROUPS"
        )

        url = reverse(
            "dashboard-widget-chart",
            kwargs={"slug": workspace.slug, "dashboard_id": dashboard.id, "widget_id": widget.id},
        )
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        counts = {item["key"]: item["count"] for item in response.data["data"]}
        assert counts == {"started": 2, "backlog": 1}

    @pytest.mark.django_db
    def test_project_scoped_chart_route(self, session_client, workspace, project, create_user):
        state = State.objects.create(name="Todo", project=project, workspace=workspace, group="unstarted")
        Issue.objects.create(name="Issue 1", workspace=workspace, project=project, state=state, created_by=create_user)

        dashboard = Dashboard.objects.create(workspace=workspace, project=project, name="Project overview")
        widget = DashboardWidget.objects.create(
            dashboard=dashboard, chart_type=DashboardWidget.ChartType.BAR, x_axis="STATE_GROUPS"
        )

        url = reverse(
            "project-dashboard-widget-chart",
            kwargs={
                "slug": workspace.slug,
                "project_id": project.id,
                "dashboard_id": dashboard.id,
                "widget_id": widget.id,
            },
        )
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        counts = {item["key"]: item["count"] for item in response.data["data"]}
        assert counts == {"unstarted": 1}
