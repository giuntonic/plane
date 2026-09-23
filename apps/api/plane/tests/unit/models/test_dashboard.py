# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models import Dashboard, DashboardWidget, Project


@pytest.mark.unit
class TestDashboardModel:
    @pytest.mark.django_db
    def test_create_workspace_dashboard_defaults(self, workspace):
        dashboard = Dashboard.objects.create(workspace=workspace, name="Engineering overview")

        assert dashboard.dashboard_type == Dashboard.DashboardType.WORKSPACE
        assert dashboard.project is None
        assert dashboard.owned_by is None
        assert dashboard.is_default is False
        assert str(dashboard) == f"{dashboard.name} <{workspace.name}>"

    @pytest.mark.django_db
    def test_create_project_dashboard_derives_workspace_from_project(self, workspace, create_user):
        project = Project.objects.create(
            name="Test Project", identifier="TP", workspace=workspace, created_by=create_user
        )

        dashboard = Dashboard.objects.create(
            project=project, name="Project dashboard", dashboard_type=Dashboard.DashboardType.PROJECT
        )

        # WorkspaceBaseModel.save() derives workspace from project.
        assert dashboard.workspace_id == workspace.id

    @pytest.mark.django_db
    def test_create_home_dashboard_owned_by_user(self, workspace, create_user):
        dashboard = Dashboard.objects.create(
            workspace=workspace,
            name="My dashboard",
            dashboard_type=Dashboard.DashboardType.HOME,
            owned_by=create_user,
        )

        assert dashboard.owned_by_id == create_user.id


@pytest.mark.unit
class TestDashboardWidgetModel:
    @pytest.mark.django_db
    def test_create_widget_defaults(self, workspace):
        dashboard = Dashboard.objects.create(workspace=workspace, name="Engineering overview")

        widget = DashboardWidget.objects.create(
            dashboard=dashboard,
            name="Work items by state",
            chart_type=DashboardWidget.ChartType.BAR,
            x_axis="STATE_GROUPS",
        )

        assert widget.group_by is None
        assert widget.metric == "count"
        assert widget.filters == {}
        assert widget.layout == {}
        assert widget.sort_order == 65535
        assert widget.is_visible is True
        assert str(widget) == f"{widget.name} <{dashboard.name}>"

    @pytest.mark.django_db
    def test_widgets_ordered_by_sort_order(self, workspace):
        dashboard = Dashboard.objects.create(workspace=workspace, name="Engineering overview")

        second = DashboardWidget.objects.create(
            dashboard=dashboard, chart_type=DashboardWidget.ChartType.BAR, x_axis="PRIORITY", sort_order=200
        )
        first = DashboardWidget.objects.create(
            dashboard=dashboard, chart_type=DashboardWidget.ChartType.BAR, x_axis="PRIORITY", sort_order=100
        )

        assert list(dashboard.widgets.all()) == [first, second]
