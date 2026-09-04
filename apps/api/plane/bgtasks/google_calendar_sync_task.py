# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import requests
from datetime import timedelta

# Django imports
from django.conf import settings
from django.utils import timezone

# Third party imports
from celery import shared_task

# Module imports
from plane.db.models import GoogleCalendarConnection, Issue, SyncedCalendarEvent
from plane.utils import google_calendar as gcal
from plane.utils.exception_logger import log_exception


@shared_task
def sync_google_calendars():
    """Periodic fan-out (every ~10 min, see celery.py beat_schedule) —
    same shape as webhook_task.webhook_activity: iterate the connections
    that want syncing, dispatch one task per user."""
    connection_ids = GoogleCalendarConnection.objects.filter(sync_enabled=True).values_list("id", flat=True)
    for connection_id in connection_ids:
        sync_user_calendar.delay(str(connection_id))


@shared_task(bind=True, autoretry_for=(requests.RequestException,), retry_backoff=60, max_retries=3, retry_jitter=True)
def sync_user_calendar(self, connection_id):
    """Pushes the connected user's assigned, undone, due-dated issues
    (across every workspace they belong to) to their dedicated Google
    calendar, and removes events for issues that no longer qualify.
    Also used for the manual "Sincronizar agora" button — same function,
    just triggered on demand instead of on schedule."""
    connection = GoogleCalendarConnection.objects.filter(id=connection_id, sync_enabled=True).first()
    if not connection or not connection.plane_calendar_id:
        return

    try:
        access_token = gcal.get_valid_access_token(connection)
    except Exception as e:
        log_exception(e)
        return

    issues = (
        Issue.issue_objects.filter(
            assignees__in=[connection.user],
            target_date__isnull=False,
            completed_at__isnull=True,
        )
        .select_related("project", "workspace")
        .distinct()
    )

    current_issue_ids = set()
    for issue in issues:
        current_issue_ids.add(issue.id)
        google_event_id = str(issue.id).replace("-", "")
        description = (
            "Sincronizado automaticamente do Plane. Não editar a data por aqui — mude no Plane.\n\n"
            f"{settings.WEB_URL}/{issue.workspace.slug}/browse/{issue.project.identifier}-{issue.sequence_id}/"
        )
        try:
            gcal.upsert_event(
                access_token,
                connection.plane_calendar_id,
                google_event_id,
                summary=issue.name,
                description=description,
                start_date=issue.target_date.isoformat(),
                end_date=(issue.target_date + timedelta(days=1)).isoformat(),
            )
            SyncedCalendarEvent.objects.update_or_create(
                connection=connection, issue=issue, defaults={"google_event_id": google_event_id}
            )
        except Exception as e:
            log_exception(e)
            continue

    stale_events = SyncedCalendarEvent.objects.filter(connection=connection).exclude(issue_id__in=current_issue_ids)
    for synced_event in stale_events:
        try:
            gcal.delete_event(access_token, connection.plane_calendar_id, synced_event.google_event_id)
        except Exception as e:
            log_exception(e)
        synced_event.delete()

    connection.last_synced_at = timezone.now()
    connection.save(update_fields=["last_synced_at"])
