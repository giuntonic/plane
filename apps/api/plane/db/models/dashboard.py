# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .base import BaseModel
from .workspace import WorkspaceBaseModel


class Dashboard(WorkspaceBaseModel):
    class DashboardType(models.TextChoices):
        WORKSPACE = "workspace", "Workspace"
        PROJECT = "project", "Project"
        HOME = "home", "Home"

    owned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="owned_dashboards",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    dashboard_type = models.CharField(
        max_length=20,
        choices=DashboardType.choices,
        default=DashboardType.WORKSPACE,
    )
    is_default = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Dashboard"
        verbose_name_plural = "Dashboards"
        db_table = "dashboards"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.name} <{self.workspace.name}>"


class DashboardWidget(BaseModel):
    class ChartType(models.TextChoices):
        BAR = "bar-chart", "Bar Chart"
        LINE = "line-chart", "Line Chart"
        AREA = "area-chart", "Area Chart"
        PIE = "pie-chart", "Pie Chart"
        DONUT = "donut-chart", "Donut Chart"
        RADAR = "radar-chart", "Radar Chart"
        SCATTER = "scatter-chart", "Scatter Chart"

    dashboard = models.ForeignKey(
        Dashboard,
        related_name="widgets",
        on_delete=models.CASCADE,
    )
    name = models.CharField(max_length=255, blank=True)
    chart_type = models.CharField(max_length=20, choices=ChartType.choices)
    x_axis = models.CharField(max_length=50)
    group_by = models.CharField(max_length=50, null=True, blank=True)
    metric = models.CharField(max_length=20, default="count")
    filters = models.JSONField(default=dict, blank=True)
    layout = models.JSONField(default=dict, blank=True)
    sort_order = models.FloatField(default=65535)
    is_visible = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Dashboard Widget"
        verbose_name_plural = "Dashboard Widgets"
        db_table = "dashboard_widgets"
        ordering = ("sort_order",)

    def __str__(self):
        return f"{self.name or self.chart_type} <{self.dashboard.name}>"
