# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    DashboardViewSet,
    DashboardWidgetViewSet,
    DashboardWidgetChartEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/dashboards/",
        DashboardViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-dashboard",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/",
        DashboardViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-dashboard",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:dashboard_id>/widgets/",
        DashboardWidgetViewSet.as_view({"get": "list", "post": "create"}),
        name="dashboard-widget",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:dashboard_id>/widgets/<uuid:pk>/",
        DashboardWidgetViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="dashboard-widget",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:dashboard_id>/widgets/<uuid:widget_id>/chart/",
        DashboardWidgetChartEndpoint.as_view(),
        name="dashboard-widget-chart",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/dashboards/",
        DashboardViewSet.as_view({"get": "list", "post": "create"}),
        name="project-dashboard",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/dashboards/<uuid:pk>/",
        DashboardViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-dashboard",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/dashboards/<uuid:dashboard_id>/widgets/",
        DashboardWidgetViewSet.as_view({"get": "list", "post": "create"}),
        name="project-dashboard-widget",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/dashboards/<uuid:dashboard_id>/widgets/<uuid:pk>/",
        DashboardWidgetViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-dashboard-widget",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/dashboards/<uuid:dashboard_id>/widgets/<uuid:widget_id>/chart/",
        DashboardWidgetChartEndpoint.as_view(),
        name="project-dashboard-widget-chart",
    ),
]
