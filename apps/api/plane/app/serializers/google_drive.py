# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from .user import UserLiteSerializer
from plane.db.models import IssueGoogleDriveFile


class IssueGoogleDriveFileSerializer(BaseSerializer):
    created_by_detail = UserLiteSerializer(read_only=True, source="created_by")

    class Meta:
        model = IssueGoogleDriveFile
        fields = [
            "id",
            "issue",
            "project",
            "workspace",
            "drive_file_id",
            "name",
            "mime_type",
            "web_view_link",
            "icon_link",
            "created_by",
            "created_by_detail",
            "created_at",
        ]
        read_only_fields = fields
