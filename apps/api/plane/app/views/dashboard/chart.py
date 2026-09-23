# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Q, QuerySet

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import WorkspaceEntityPermission
from plane.app.views.base import BaseAPIView
from plane.db.models import Dashboard, DashboardWidget, Issue
from plane.utils.build_chart import build_analytics_chart
from plane.utils.date_utils import get_analytics_filters


def build_widget_queryset(widget: DashboardWidget, user) -> QuerySet[Issue]:
    dashboard = widget.dashboard
    filters_config = widget.filters or {}

    project_ids = filters_config.get("project_ids")
    if not project_ids and dashboard.project_id:
        project_ids = [str(dashboard.project_id)]

    analytics_filters = get_analytics_filters(
        slug=dashboard.workspace.slug,
        user=user,
        type="chart",
        date_filter=filters_config.get("date_filter"),
        project_ids=project_ids,
    )

    queryset = Issue.issue_objects.filter(**analytics_filters["base_filters"])

    if analytics_filters["chart_period_range"]:
        start_date, end_date = analytics_filters["chart_period_range"]
        queryset = queryset.filter(created_at__date__gte=start_date, created_at__date__lte=end_date)

    cycle_id = filters_config.get("cycle_id")
    if cycle_id:
        queryset = queryset.filter(issue_cycle__cycle_id=cycle_id, issue_cycle__deleted_at__isnull=True)

    module_id = filters_config.get("module_id")
    if module_id:
        queryset = queryset.filter(issue_module__module_id=module_id, issue_module__deleted_at__isnull=True)

    priority = filters_config.get("priority")
    if priority:
        priority = priority if isinstance(priority, list) else [priority]
        queryset = queryset.filter(priority__in=priority)

    state_group = filters_config.get("state_group")
    if state_group:
        state_group = state_group if isinstance(state_group, list) else [state_group]
        queryset = queryset.filter(state__group__in=state_group)

    return queryset


class DashboardWidgetChartEndpoint(BaseAPIView):
    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, dashboard_id, widget_id, project_id=None):
        dashboard_qs = Dashboard.objects.filter(workspace__slug=slug).filter(
            Q(dashboard_type=Dashboard.DashboardType.HOME, owned_by=request.user)
            | ~Q(dashboard_type=Dashboard.DashboardType.HOME)
        )
        # Also routed as projects/<project_id>/dashboards/..., scope to that project
        if project_id:
            dashboard_qs = dashboard_qs.filter(project_id=project_id)
        widget = DashboardWidget.objects.select_related("dashboard", "dashboard__workspace").get(
            pk=widget_id, dashboard_id=dashboard_id, dashboard__in=dashboard_qs
        )

        queryset = build_widget_queryset(widget, request.user)
        data = build_analytics_chart(queryset, widget.x_axis, widget.group_by)

        return Response(data, status=status.HTTP_200_OK)
