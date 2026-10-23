# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from .partial_update import SaveOnlySentFieldsMixin
from plane.db.models import IssueChecklistItem


class IssueChecklistItemSerializer(SaveOnlySentFieldsMixin, BaseSerializer):
    class Meta:
        model = IssueChecklistItem
        fields = [
            "id",
            "issue",
            "project",
            "workspace",
            "parent",
            "name",
            "is_completed",
            "completed_at",
            "assignee",
            "due_date",
            "sort_order",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "issue",
            "project",
            "workspace",
            "parent",
            "completed_at",
            "created_by",
            "created_at",
            "updated_at",
        ]
