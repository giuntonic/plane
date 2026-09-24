# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Two-way sync between work items and each connected user's Google Calendar.

Plane -> Google ("push"): every work item assigned to the user, with a due
date, not completed (and in one of the chosen projects) becomes an all-day
event spanning start date -> due date in the dedicated "Plane" calendar (or
in one calendar per project). Pushed right after the work item changes
(sync_issue_calendar_events, fired from issue_activity) and again by the
periodic full sync as a safety net.

Google -> Plane ("pull"): when the user moves or renames one of those events
in Google, the work item's dates/title follow. Google notifies us through a
push channel (GoogleCalendarNotificationEndpoint -> pull_calendar_changes);
a periodic pull with syncTokens covers missed notifications. Our own writes
are recognised through SyncedCalendarEvent.pushed_* so they never echo back.
"""

# Python imports
import json
import secrets
import uuid
from datetime import timedelta

import requests

# Django imports
from django.conf import settings
from django.db.models import Q
from django.utils import timezone

# Third party imports
from celery import shared_task

# Module imports
from plane.db.models import GoogleCalendarConnection, Issue, ProjectMember, SyncedCalendarEvent
from plane.settings.redis import redis_instance
from plane.utils import google_calendar as gcal
from plane.utils.exception_logger import log_exception

# Members (15) and admins (20) can edit work items; guests (5) can't, so a
# change a guest makes in Google is not applied back.
EDITOR_ROLES = (15, 20)
# Channels are renewed when they have less than this left.
CHANNEL_RENEW_MARGIN = timedelta(days=1)
# Debounce window for the per-issue push fired by issue_activity.
ISSUE_SYNC_DEBOUNCE_SECONDS = 5


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _issue_url(issue):
    return f"{settings.WEB_URL}/{issue.workspace.slug}/browse/{issue.project.identifier}-{issue.sequence_id}/"


def _qualifying_issues(connection):
    issues = Issue.issue_objects.filter(
        assignees__in=[connection.user],
        target_date__isnull=False,
        completed_at__isnull=True,
        # Only projects the user is still an active member of.
        project__project_projectmember__member=connection.user,
        project__project_projectmember__is_active=True,
    )
    if connection.sync_project_ids:
        issues = issues.filter(project_id__in=connection.sync_project_ids)
    return issues.select_related("project", "workspace").distinct()


def _issue_qualifies(connection, issue):
    return _qualifying_issues(connection).filter(pk=issue.pk).exists()


def _calendar_for_issue(connection, access_token, issue):
    """Google calendar the work item's event belongs in, creating the
    per-project calendar the first time it's needed."""
    if not connection.calendar_per_project:
        return connection.plane_calendar_id

    project_id = str(issue.project_id)
    calendar_id = connection.project_calendar_ids.get(project_id)
    if not calendar_id:
        calendar_id = gcal.create_dedicated_calendar(access_token, summary=f"Plane · {issue.project.name}")
        connection.project_calendar_ids = {**connection.project_calendar_ids, project_id: calendar_id}
        connection.save(update_fields=["project_calendar_ids"])
    return calendar_id


def _managed_calendar_ids(connection):
    ids = [connection.plane_calendar_id] if connection.plane_calendar_id else []
    ids += [c for c in connection.project_calendar_ids.values() if c and c not in ids]
    return ids


def _push_issue(connection, access_token, issue):
    calendar_id = _calendar_for_issue(connection, access_token, issue)
    event_id = gcal.issue_event_id(issue.id)
    synced = SyncedCalendarEvent.objects.filter(connection=connection, issue=issue).first()

    # The event moved to another calendar (per-project setting toggled):
    # remove it from the old one first.
    if synced and synced.calendar_id and synced.calendar_id != calendar_id:
        gcal.delete_event(access_token, synced.calendar_id, synced.google_event_id)

    body = gcal.build_issue_event_body(
        issue_id=issue.id,
        name=issue.name,
        start_date=issue.start_date,
        target_date=issue.target_date,
        priority=issue.priority,
        url=_issue_url(issue),
        color_by_priority=connection.color_by_priority,
        reminder_days_before=connection.reminder_days_before,
    )
    gcal.upsert_event(access_token, calendar_id, event_id, body)

    first_day, last_day = gcal.issue_date_range(issue.start_date, issue.target_date)
    SyncedCalendarEvent.objects.update_or_create(
        connection=connection,
        issue=issue,
        defaults={
            "google_event_id": event_id,
            "calendar_id": calendar_id,
            "pushed_start": first_day,
            "pushed_end": last_day,
            "pushed_summary": issue.name,
            "pushed_at": timezone.now(),
        },
    )


def _remove_synced(connection, access_token, synced):
    try:
        gcal.delete_event(access_token, synced.calendar_id or connection.plane_calendar_id, synced.google_event_id)
    except Exception as e:
        log_exception(e)
    # Hard delete: a soft-deleted row would still hold the
    # (connection, issue) unique slot and break the next re-sync.
    synced.delete(soft=False)


def _ensure_plane_calendar(connection, access_token):
    """Recreates the dedicated calendar if the user deleted it in Google."""
    if connection.plane_calendar_id and gcal.calendar_exists(access_token, connection.plane_calendar_id):
        return
    old_id = connection.plane_calendar_id
    connection.plane_calendar_id = gcal.create_dedicated_calendar(access_token)
    connection.overlay_calendar_ids = [
        connection.plane_calendar_id if c == old_id else c for c in connection.overlay_calendar_ids
    ] or [connection.plane_calendar_id]
    connection.sync_tokens = {k: v for k, v in connection.sync_tokens.items() if k != old_id}
    connection.save(update_fields=["plane_calendar_id", "overlay_calendar_ids", "sync_tokens"])
    SyncedCalendarEvent.objects.filter(connection=connection, calendar_id__in=[old_id, ""]).delete(soft=False)


def _user_can_edit(user_id, project_id):
    return ProjectMember.objects.filter(
        member_id=user_id, project_id=project_id, is_active=True, role__in=EDITOR_ROLES
    ).exists()


def _apply_event_to_issue(connection, synced, event):
    """Applies a change made in Google to the work item. Returns the list
    of changed fields (empty when nothing had to change)."""
    if synced.pushed_start is None or synced.pushed_end is None:
        # Row from before two-way sync: we don't know what we pushed, so we
        # can't tell a Google edit from our own write. Next push fills it.
        return []

    first_day, last_day = gcal.event_date_range(event)
    summary = (event.get("summary") or "").strip()
    dates_changed = first_day is not None and (first_day, last_day) != (synced.pushed_start, synced.pushed_end)
    name_changed = bool(summary) and summary != synced.pushed_summary
    if not (dates_changed or name_changed):
        return []

    issue = Issue.issue_objects.filter(pk=synced.issue_id).select_related("project").first()
    if not issue or issue.completed_at or not _user_can_edit(connection.user_id, issue.project_id):
        return []

    requested, current = {}, {}
    if dates_changed:
        start_date, target_date = gcal.dates_from_event_range(first_day, last_day, issue.start_date is not None)
        if start_date != issue.start_date:
            requested["start_date"], current["start_date"] = start_date, issue.start_date
            issue.start_date = start_date
        if target_date != issue.target_date:
            requested["target_date"], current["target_date"] = target_date, issue.target_date
            issue.target_date = target_date
    if name_changed and summary[:255] != issue.name:
        requested["name"], current["name"] = summary[:255], issue.name
        issue.name = summary[:255]

    # Remember what Google now has, so the push that follows is a no-op
    # and this change is never read back as a new edit.
    synced.pushed_start, synced.pushed_end = first_day, last_day
    synced.pushed_summary = summary or synced.pushed_summary
    synced.save(update_fields=["pushed_start", "pushed_end", "pushed_summary"])

    if not requested:
        return []

    issue.updated_by_id = connection.user_id
    issue.save(update_fields=[*requested.keys(), "updated_at", "updated_by"], disable_auto_set_user=True)

    # Imported here: issue_activities_task imports this module too.
    from plane.bgtasks.issue_activities_task import issue_activity

    # One activity per field — same shape the bulk date endpoint uses, so
    # the activity feed reads "X changed the due date to …".
    for field, value in requested.items():
        issue_activity.delay(
            type="issue.activity.updated",
            requested_data=json.dumps({field: str(value) if value is not None else None}),
            current_instance=json.dumps({field: str(current[field]) if current[field] is not None else None}),
            issue_id=str(issue.id),
            actor_id=str(connection.user_id),
            project_id=str(issue.project_id),
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=settings.WEB_URL,
        )
    return list(requested.keys())


def _pull_changes(connection, access_token):
    """Reads what changed in the managed calendars since the last pull and
    applies Google-side edits to the work items."""
    tokens = dict(connection.sync_tokens)
    for calendar_id in _managed_calendar_ids(connection):
        try:
            items, next_token = gcal.list_changed_events(access_token, calendar_id, tokens.get(calendar_id))
        except gcal.SyncTokenExpired:
            items, next_token = gcal.list_changed_events(access_token, calendar_id, None)
        except requests.HTTPError as e:
            log_exception(e)
            continue

        synced_by_event = {
            s.google_event_id: s
            for s in SyncedCalendarEvent.objects.filter(
                connection=connection, google_event_id__in=[i.get("id") for i in items if i.get("id")]
            )
        }
        for event in items:
            synced = synced_by_event.get(event.get("id"))
            # Deleted in Google: the next push recreates it — Plane decides
            # what's on the calendar (complete the work item or clear its
            # due date to remove it).
            if not synced or event.get("status") == "cancelled":
                continue
            try:
                _apply_event_to_issue(connection, synced, event)
            except Exception as e:
                log_exception(e)

        if next_token:
            tokens[calendar_id] = next_token

    connection.sync_tokens = tokens
    connection.save(update_fields=["sync_tokens"])


def notification_address():
    """Public HTTPS URL Google posts change notifications to, or None when
    the instance isn't reachable over HTTPS (Google refuses plain HTTP)."""
    base = (settings.WEB_URL or "").rstrip("/")
    if not base.startswith("https://"):
        return None
    return f"{base}/api/google-calendar/notifications/"


def _renew_watch_channels(connection, access_token):
    address = notification_address()
    if not address or not connection.two_way_sync:
        _stop_watch_channels(connection, access_token)
        return

    now_ms = int(timezone.now().timestamp() * 1000)
    margin_ms = int(CHANNEL_RENEW_MARGIN.total_seconds() * 1000)
    wanted = set(_managed_calendar_ids(connection))
    channels = []
    for channel in connection.watch_channels:
        still_valid = channel.get("calendar_id") in wanted and int(channel.get("expiration") or 0) - now_ms > margin_ms
        if still_valid:
            channels.append(channel)
        else:
            gcal.stop_channel(access_token, channel.get("id"), channel.get("resource_id"))

    watched = {c["calendar_id"] for c in channels}
    for calendar_id in wanted - watched:
        channel_id, channel_token = str(uuid.uuid4()), secrets.token_urlsafe(32)
        try:
            resource = gcal.watch_events(access_token, calendar_id, channel_id, channel_token, address)
        except requests.HTTPError as e:
            # e.g. domain not allowed for push — the periodic pull still works.
            log_exception(e)
            continue
        channels.append(
            {
                "id": channel_id,
                "resource_id": resource.get("resourceId"),
                "calendar_id": calendar_id,
                "token": channel_token,
                "expiration": int(resource.get("expiration") or 0),
            }
        )

    connection.watch_channels = channels
    connection.save(update_fields=["watch_channels"])


def _stop_watch_channels(connection, access_token):
    for channel in connection.watch_channels:
        gcal.stop_channel(access_token, channel.get("id"), channel.get("resource_id"))
    if connection.watch_channels:
        connection.watch_channels = []
        connection.save(update_fields=["watch_channels"])


def teardown_connection(connection):
    """Called on disconnect: stops push channels (best effort)."""
    try:
        access_token = gcal.get_valid_access_token(connection)
        _stop_watch_channels(connection, access_token)
    except Exception as e:
        log_exception(e)


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------


@shared_task
def sync_google_calendars():
    """Periodic fan-out (every ~10 min, see celery.py beat_schedule) —
    same shape as webhook_task.webhook_activity: iterate the connections
    that want syncing, dispatch one task per user."""
    connection_ids = GoogleCalendarConnection.objects.filter(sync_enabled=True).values_list("id", flat=True)
    for connection_id in connection_ids:
        sync_user_calendar.delay(str(connection_id))


@shared_task
def pull_google_calendars():
    """Periodic pull for two-way connections (every ~2 min) — catches
    changes when push notifications aren't available or got lost."""
    connection_ids = GoogleCalendarConnection.objects.filter(sync_enabled=True, two_way_sync=True).values_list(
        "id", flat=True
    )
    for connection_id in connection_ids:
        pull_calendar_changes.delay(str(connection_id))


@shared_task(bind=True, autoretry_for=(requests.RequestException,), retry_backoff=60, max_retries=3, retry_jitter=True)
def sync_user_calendar(self, connection_id):
    """Full sync for one user: pull Google-side edits, push every
    qualifying work item, remove events that no longer qualify and keep
    the push-notification channels alive. Also what "Sincronizar agora"
    and a preferences change trigger."""
    connection = GoogleCalendarConnection.objects.filter(id=connection_id, sync_enabled=True).first()
    if not connection:
        return

    try:
        access_token = gcal.get_valid_access_token(connection)
        _ensure_plane_calendar(connection, access_token)
    except Exception as e:
        log_exception(e)
        return

    if connection.two_way_sync:
        _pull_changes(connection, access_token)

    current_issue_ids = set()
    for issue in _qualifying_issues(connection):
        current_issue_ids.add(issue.id)
        try:
            _push_issue(connection, access_token, issue)
        except Exception as e:
            log_exception(e)

    for synced in SyncedCalendarEvent.objects.filter(connection=connection).exclude(issue_id__in=current_issue_ids):
        _remove_synced(connection, access_token, synced)

    try:
        _renew_watch_channels(connection, access_token)
    except Exception as e:
        log_exception(e)

    connection.last_synced_at = timezone.now()
    connection.save(update_fields=["last_synced_at"])


@shared_task(bind=True, autoretry_for=(requests.RequestException,), retry_backoff=30, max_retries=3, retry_jitter=True)
def pull_calendar_changes(self, connection_id):
    connection = GoogleCalendarConnection.objects.filter(id=connection_id, sync_enabled=True, two_way_sync=True).first()
    if not connection:
        return
    try:
        access_token = gcal.get_valid_access_token(connection)
    except Exception as e:
        log_exception(e)
        return
    _pull_changes(connection, access_token)


@shared_task(bind=True, autoretry_for=(requests.RequestException,), retry_backoff=30, max_retries=3, retry_jitter=True)
def sync_issue_calendar_events(self, issue_id):
    """Pushes one work item to the calendars of everyone it concerns right
    after it changed: its assignees with a connection, plus anyone who has
    it on their calendar already (e.g. just unassigned -> remove it)."""
    issue = Issue.all_objects.filter(pk=issue_id).select_related("project", "workspace").first()
    connections = GoogleCalendarConnection.objects.filter(sync_enabled=True).filter(
        Q(synced_events__issue_id=issue_id) | Q(user__in=issue.assignees.all() if issue else [])
    )
    for connection in connections.distinct():
        try:
            access_token = gcal.get_valid_access_token(connection)
            if issue and issue.deleted_at is None and _issue_qualifies(connection, issue):
                if not connection.plane_calendar_id:
                    continue
                _push_issue(connection, access_token, issue)
            else:
                for synced in SyncedCalendarEvent.objects.filter(connection=connection, issue_id=issue_id):
                    _remove_synced(connection, access_token, synced)
        except Exception as e:
            log_exception(e)


def schedule_issue_calendar_sync(issue_id):
    """Debounced trigger used by issue_activity: many activities for the
    same work item within a few seconds (e.g. a form save touching several
    fields) collapse into one push, which also runs after the triggering
    request committed its changes."""
    if not issue_id or not GoogleCalendarConnection.objects.filter(sync_enabled=True).exists():
        return
    try:
        if not redis_instance().set(f"gcal-issue-sync:{issue_id}", "1", nx=True, ex=ISSUE_SYNC_DEBOUNCE_SECONDS):
            return
    except Exception:
        # Redis unavailable: fall through without debounce.
        pass
    sync_issue_calendar_events.apply_async(args=[str(issue_id)], countdown=ISSUE_SYNC_DEBOUNCE_SECONDS)
