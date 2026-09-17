# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Q

# Module imports
from plane.app.permissions import WorkspaceEntityPermission
from plane.app.serializers import DashboardSerializer, DashboardWidgetSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import Dashboard, DashboardWidget, Project, Workspace


class DashboardViewSet(BaseViewSet):
    permission_classes = [WorkspaceEntityPermission]
    model = Dashboard
    serializer_class = DashboardSerializer

    def get_queryset(self):
        queryset = super().get_queryset().filter(workspace__slug=self.workspace_slug)

        if self.project_id:
            queryset = queryset.filter(project_id=self.project_id)
        else:
            queryset = queryset.filter(project__isnull=True)

        dashboard_type = self.request.GET.get("dashboard_type", None)
        if dashboard_type:
            queryset = queryset.filter(dashboard_type=dashboard_type)

        # Home dashboards are private to their owner
        queryset = queryset.filter(
            Q(dashboard_type=Dashboard.DashboardType.HOME, owned_by=self.request.user)
            | ~Q(dashboard_type=Dashboard.DashboardType.HOME)
        )

        return self.filter_queryset(queryset)

    def perform_create(self, serializer):
        workspace = Workspace.objects.get(slug=self.workspace_slug)

        if self.project_id:
            project = Project.objects.get(pk=self.project_id, workspace=workspace)
            serializer.save(
                workspace_id=workspace.id,
                project_id=project.id,
                dashboard_type=Dashboard.DashboardType.PROJECT,
            )
        elif self.request.data.get("dashboard_type") == Dashboard.DashboardType.HOME:
            serializer.save(
                workspace_id=workspace.id,
                dashboard_type=Dashboard.DashboardType.HOME,
                owned_by=self.request.user,
            )
        else:
            serializer.save(
                workspace_id=workspace.id,
                dashboard_type=Dashboard.DashboardType.WORKSPACE,
            )


class DashboardWidgetViewSet(BaseViewSet):
    permission_classes = [WorkspaceEntityPermission]
    model = DashboardWidget
    serializer_class = DashboardWidgetSerializer

    def get_dashboard_queryset(self):
        return Dashboard.objects.filter(workspace__slug=self.workspace_slug).filter(
            Q(dashboard_type=Dashboard.DashboardType.HOME, owned_by=self.request.user)
            | ~Q(dashboard_type=Dashboard.DashboardType.HOME)
        )

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .filter(
                dashboard_id=self.kwargs.get("dashboard_id"),
                dashboard__in=self.get_dashboard_queryset(),
            )
        )
        return self.filter_queryset(queryset)

    def perform_create(self, serializer):
        dashboard = self.get_dashboard_queryset().get(pk=self.kwargs.get("dashboard_id"))
        serializer.save(dashboard_id=dashboard.id)
