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

    # Google -> Plane: moving/renaming a synced event in Google updates the
    # work item's dates/title.
    two_way_sync = models.BooleanField(default=True)
    # Project ids whose work items are synced; empty means every project.
    sync_project_ids = models.JSONField(default=list, blank=True)
    # One Google calendar per project instead of the single "Plane" one.
    calendar_per_project = models.BooleanField(default=False)
    # {project_id: google_calendar_id}, filled lazily when calendar_per_project is on.
    project_calendar_ids = models.JSONField(default=dict, blank=True)
    # Color events by the work item's priority.
    color_by_priority = models.BooleanField(default=True)
    # None: Google's default reminders for the calendar; -1: no reminders;
    # N >= 1: a popup N days before the due date, at 9:00.
    reminder_days_before = models.IntegerField(null=True, blank=True)
    # {google_calendar_id: nextSyncToken} for incremental pulls.
    sync_tokens = models.JSONField(default=dict, blank=True)
    # Active push-notification channels:
    # [{"id", "resource_id", "calendar_id", "token", "expiration"}]
    watch_channels = models.JSONField(default=list, blank=True)

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

    connection = models.ForeignKey(GoogleCalendarConnection, on_delete=models.CASCADE, related_name="synced_events")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="synced_calendar_events")
    google_event_id = models.CharField(max_length=255)
    # Calendar the event lives in (the "Plane" calendar or a per-project one).
    calendar_id = models.CharField(max_length=255, blank=True)
    # What Plane last wrote to the event — lets the pull tell a change made in
    # Google apart from our own echo. Null for rows created before two-way sync.
    pushed_start = models.DateField(null=True, blank=True)
    pushed_end = models.DateField(null=True, blank=True)
    pushed_summary = models.TextField(blank=True)
    pushed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Synced Calendar Event"
        verbose_name_plural = "Synced Calendar Events"
        db_table = "synced_calendar_events"
        unique_together = ["connection", "issue"]
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.connection.user.email} -> {self.issue_id} ({self.google_event_id})"


class IssueCalendarEvent(BaseModel):
    """A Google Calendar event (usually a meeting) linked to a work item —
    either scheduled from Plane or an existing event linked afterwards.
    Distinct from SyncedCalendarEvent, which is the automatic due-date
    mirror of the work item itself."""

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="calendar_events")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="issue_calendar_events")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="issue_calendar_events")
    google_event_id = models.CharField(max_length=1024)
    calendar_id = models.CharField(max_length=255)
    summary = models.CharField(max_length=1024, blank=True)
    start = models.DateTimeField(null=True, blank=True)
    end = models.DateTimeField(null=True, blank=True)
    all_day = models.BooleanField(default=False)
    html_link = models.TextField(blank=True)
    meet_link = models.TextField(blank=True)
    attendees = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = "Issue Calendar Event"
        verbose_name_plural = "Issue Calendar Events"
        db_table = "issue_calendar_events"
        ordering = ("start",)

    def __str__(self):
        return f"{self.issue_id} -> {self.summary} ({self.google_event_id})"
