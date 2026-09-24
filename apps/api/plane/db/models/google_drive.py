# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models
from django.db.models import Q

# Module imports
from .base import BaseModel
from .project import ProjectBaseModel
from plane.license.utils.encryption import decrypt_data, encrypt_data


class GoogleDriveConnection(BaseModel):
    """A single user's personal connection to their own Google Drive, used
    to browse/pick files from inside Plane (work item attachments, Page
    embeds). Kept separate from GoogleCalendarConnection so each grant can
    be revoked on its own."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="google_drive_connection",
    )
    google_email = models.CharField(max_length=255, blank=True)

    # Encrypted at rest, same as GoogleCalendarConnection.
    _access_token = models.TextField(db_column="access_token", blank=True)
    _refresh_token = models.TextField(db_column="refresh_token", blank=True)
    token_expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Google Drive Connection"
        verbose_name_plural = "Google Drive Connections"
        db_table = "google_drive_connections"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.user.email} <{self.google_email}>"

    @property
    def access_token(self):
        return decrypt_data(self._access_token)

    @access_token.setter
    def access_token(self, value):
        self._access_token = encrypt_data(value)

    @property
    def refresh_token(self):
        return decrypt_data(self._refresh_token)

    @refresh_token.setter
    def refresh_token(self, value):
        self._refresh_token = encrypt_data(value)


class IssueGoogleDriveFile(ProjectBaseModel):
    """A Google Drive file linked to a work item. Only metadata lives in
    Plane — the file itself stays in Drive, so it's always the live version
    and access is governed by Drive's own sharing (each viewer opens it
    with their own Google account)."""

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="google_drive_files")
    drive_file_id = models.CharField(max_length=255)
    name = models.CharField(max_length=1024)
    mime_type = models.CharField(max_length=255, blank=True)
    web_view_link = models.TextField(blank=True)
    icon_link = models.TextField(blank=True)

    class Meta:
        verbose_name = "Issue Google Drive File"
        verbose_name_plural = "Issue Google Drive Files"
        db_table = "issue_google_drive_files"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "drive_file_id"],
                condition=Q(deleted_at__isnull=True),
                name="issue_google_drive_file_unique_issue_file_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"{self.issue_id} -> {self.name} ({self.drive_file_id})"
