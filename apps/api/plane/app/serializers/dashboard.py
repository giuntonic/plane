# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .base import BaseSerializer
from plane.db.models import Dashboard, DashboardWidget


class DashboardWidgetSerializer(BaseSerializer):
    class Meta:
        model = DashboardWidget
        fields = "__all__"
        read_only_fields = ["dashboard"]


class DashboardSerializer(BaseSerializer):
    widgets = DashboardWidgetSerializer(many=True, read_only=True)

    class Meta:
        model = Dashboard
        fields = "__all__"
        read_only_fields = ["workspace", "project", "owned_by"]
