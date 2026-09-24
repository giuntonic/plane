# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .base import BaseModel
from plane.license.utils.encryption import decrypt_data, encrypt_data


class GoogleCalendarConnection(BaseModel):
    """A single user's personal connection to their own Google account,
    used to sync their assigned issues to a dedicated Google Calendar and
    to read back events from calendars they choose to overlay in Plane."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="google_calendar_connection",
    )
    google_email = models.CharField(max_length=255, blank=True)

    # Encrypted at rest — these are long-lived, high-value credentials,
    # unlike the plaintext tokens on SocialLoginConnection/Account.
    _access_token = models.TextField(db_column="access_token", blank=True)
    _refresh_token = models.TextField(db_column="refresh_token", blank=True)
    token_expires_at = models.DateTimeField(null=True, blank=True)

    # The dedicated calendar Plane creates automatically on first connect.
    plane_calendar_id = models.CharField(max_length=255, blank=True)

    sync_enabled = models.BooleanField(default=True)
    # Calendar ids (owned by this user) whose events should be overlaid
    # read-only in Plane's cross-project calendar view.
    overlay_calendar_ids = models.JSONField(default=list, blank=True)

    last_synced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Google Calendar Connection"
        verbose_name_plural = "Google Calendar Connections"
        db_table = "google_calendar_connections"
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


class SyncedCalendarEvent(BaseModel):
    """Bookkeeping row: which Google Calendar event corresponds to which
    issue, for a given connection — lets the sync task know what to
    update/delete when an issue changes or stops qualifying."""

    connection = models.ForeignKey(
        GoogleCalendarConnection, on_delete=models.CASCADE, related_name="synced_events"
    )
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="synced_calendar_events")
    google_event_id = models.CharField(max_length=255)

    class Meta:
        verbose_name = "Synced Calendar Event"
        verbose_name_plural = "Synced Calendar Events"
        db_table = "synced_calendar_events"
        unique_together = ["connection", "issue"]
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.connection.user.email} -> {self.issue_id} ({self.google_event_id})"
