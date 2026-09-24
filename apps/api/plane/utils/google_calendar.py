# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Small client for the Google Calendar API, shared between the personal
OAuth views (apps/api/plane/app/views/user/google_calendar.py), the work
item meeting views (apps/api/plane/app/views/issue/calendar_event.py) and
the sync tasks (apps/api/plane/bgtasks/google_calendar_sync_task.py).
Callers always pass a connection or an access token — this module never
touches request/session state.

The pure helpers at the bottom (event bodies, date ranges) hold the rules
of the two-way sync and are unit tested on their own."""

import os
from datetime import date, datetime, timedelta
from urllib.parse import quote

import requests
from django.utils import timezone

from plane.license.utils.instance_value import get_configuration_value

TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3"

# Google event colorIds (Calendar "event" palette): 11 Tomato, 6 Tangerine,
# 5 Banana, 9 Blueberry. "none" keeps the calendar's own color.
PRIORITY_COLOR_IDS = {"urgent": "11", "high": "6", "medium": "5", "low": "9"}

# Private extended property that marks an event as belonging to a work item.
ISSUE_PROPERTY = "plane_issue_id"


class SyncTokenExpired(Exception):
    """Google answered 410 GONE: the stored syncToken is no longer valid
    and a full listing is needed to get a new one."""


def _get_client_credentials():
    (client_id, client_secret) = get_configuration_value(
        [
            {"key": "GOOGLE_CLIENT_ID", "default": os.environ.get("GOOGLE_CLIENT_ID")},
            {"key": "GOOGLE_CLIENT_SECRET", "default": os.environ.get("GOOGLE_CLIENT_SECRET")},
        ]
    )
    return client_id, client_secret


def get_valid_access_token(connection):
    """Returns a live access token for this connection, refreshing it
    first if it has expired (or is about to, within 60s)."""
    if connection.token_expires_at and connection.token_expires_at > timezone.now() + timedelta(seconds=60):
        return connection.access_token

    client_id, client_secret = _get_client_credentials()
    response = requests.post(
        TOKEN_URL,
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": connection.refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=15,
    )
    response.raise_for_status()
    data = response.json()

    connection.access_token = data["access_token"]
    connection.token_expires_at = timezone.now() + timedelta(seconds=data.get("expires_in", 3600))
    connection.save(update_fields=["_access_token", "token_expires_at"])
    return connection.access_token


def revoke_token(connection):
    # Revoking either token revokes the whole grant.
    token = connection.refresh_token or connection.access_token
    if not token:
        return
    try:
        requests.post(REVOKE_URL, params={"token": token}, timeout=15)
    except requests.RequestException:
        # Best-effort: the connection row is being deleted regardless.
        pass


def _headers(access_token):
    return {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}


def _calendar_url(calendar_id, suffix=""):
    # Calendar ids contain "@" and sometimes "#" (holiday calendars) — they
    # must be percent-encoded to be a single path segment.
    return f"{CALENDAR_API_BASE}/calendars/{quote(calendar_id, safe='')}{suffix}"


def _event_url(calendar_id, event_id):
    return _calendar_url(calendar_id, f"/events/{quote(event_id, safe='')}")


# ---------------------------------------------------------------------------
# Calendars
# ---------------------------------------------------------------------------


def list_calendars(access_token):
    response = requests.get(f"{CALENDAR_API_BASE}/users/me/calendarList", headers=_headers(access_token), timeout=15)
    response.raise_for_status()
    return response.json().get("items", [])


def create_dedicated_calendar(access_token, summary="Plane"):
    response = requests.post(
        f"{CALENDAR_API_BASE}/calendars",
        headers=_headers(access_token),
        json={"summary": summary},
        timeout=15,
    )
    response.raise_for_status()
    return response.json()["id"]


def calendar_exists(access_token, calendar_id):
    response = requests.get(_calendar_url(calendar_id), headers=_headers(access_token), timeout=15)
    if response.status_code in (404, 410):
        return False
    response.raise_for_status()
    return True


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------


def _as_rfc3339(date_str, end_of_day=False):
    """The events.list endpoint requires full RFC3339 timestamps — a
    bare YYYY-MM-DD (what the calendar view sends as after/before)
    gets rejected with a 400. Leave already-full timestamps as-is."""
    if "T" in date_str:
        return date_str
    return f"{date_str}T{'23:59:59' if end_of_day else '00:00:00'}Z"


def list_events(access_token, calendar_id, time_min, time_max):
    response = requests.get(
        _calendar_url(calendar_id, "/events"),
        headers=_headers(access_token),
        params={
            "timeMin": _as_rfc3339(time_min),
            "timeMax": _as_rfc3339(time_max, end_of_day=True),
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": 2500,
        },
        timeout=15,
    )
    response.raise_for_status()
    return response.json().get("items", [])


def list_changed_events(access_token, calendar_id, sync_token=None):
    """Incremental listing. With a sync_token returns only what changed
    since it (deleted events come back with status "cancelled"); without
    one, lists everything. Returns (items, next_sync_token)."""
    items = []
    page_token = None
    while True:
        params = {"showDeleted": "true", "maxResults": 2500}
        if sync_token:
            params["syncToken"] = sync_token
        if page_token:
            params["pageToken"] = page_token
        response = requests.get(
            _calendar_url(calendar_id, "/events"), headers=_headers(access_token), params=params, timeout=30
        )
        if response.status_code == 410:
            raise SyncTokenExpired()
        response.raise_for_status()
        data = response.json()
        items.extend(data.get("items", []))
        page_token = data.get("nextPageToken")
        if not page_token:
            return items, data.get("nextSyncToken")


def get_event(access_token, calendar_id, event_id):
    response = requests.get(_event_url(calendar_id, event_id), headers=_headers(access_token), timeout=15)
    response.raise_for_status()
    return response.json()


def upsert_event(access_token, calendar_id, event_id, body):
    """Deterministic create-or-update by id — same dance validated in the
    original n8n workflow: try create with an explicit id, fall back to
    update when it already exists (including an event the user deleted in
    Google, which lingers as "cancelled": body carries status=confirmed)."""
    create_response = requests.post(
        _calendar_url(calendar_id, "/events"),
        headers=_headers(access_token),
        json={**body, "id": event_id},
        timeout=15,
    )
    if create_response.status_code in (200, 201):
        return create_response.json()

    update_response = requests.patch(
        _event_url(calendar_id, event_id),
        headers=_headers(access_token),
        json=body,
        timeout=15,
    )
    update_response.raise_for_status()
    return update_response.json()


def create_event(access_token, calendar_id, body, with_meet=False, send_updates="all"):
    params = {"sendUpdates": send_updates}
    if with_meet:
        params["conferenceDataVersion"] = 1
    response = requests.post(
        _calendar_url(calendar_id, "/events"),
        headers=_headers(access_token),
        params=params,
        json=body,
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def patch_event(access_token, calendar_id, event_id, body, send_updates="none"):
    response = requests.patch(
        _event_url(calendar_id, event_id),
        headers=_headers(access_token),
        params={"sendUpdates": send_updates},
        json=body,
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def delete_event(access_token, calendar_id, event_id, send_updates="none"):
    response = requests.delete(
        _event_url(calendar_id, event_id),
        headers=_headers(access_token),
        params={"sendUpdates": send_updates},
        timeout=15,
    )
    # 404/410 just means it's already gone — treat as success either way.
    if response.status_code not in (200, 204, 404, 410):
        response.raise_for_status()


# ---------------------------------------------------------------------------
# Push notifications
# ---------------------------------------------------------------------------


def watch_events(access_token, calendar_id, channel_id, channel_token, address):
    """Asks Google to POST to `address` whenever an event in the calendar
    changes. Returns the channel resource (id, resourceId, expiration ms)."""
    response = requests.post(
        _calendar_url(calendar_id, "/events/watch"),
        headers=_headers(access_token),
        json={"id": channel_id, "type": "web_hook", "address": address, "token": channel_token},
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def stop_channel(access_token, channel_id, resource_id):
    try:
        requests.post(
            f"{CALENDAR_API_BASE}/channels/stop",
            headers=_headers(access_token),
            json={"id": channel_id, "resourceId": resource_id},
            timeout=15,
        )
    except requests.RequestException:
        # Best-effort: an unstopped channel just expires on its own.
        pass


# ---------------------------------------------------------------------------
# Pure helpers (two-way sync rules)
# ---------------------------------------------------------------------------


def issue_event_id(issue_id):
    """Deterministic Google event id for a work item (base32hex-safe)."""
    return str(issue_id).replace("-", "")


def issue_date_range(start_date, target_date):
    """(first_day, last_day) the work item occupies in the calendar: from
    its start date to its due date, or just the due date when there's no
    (valid) start date."""
    if start_date and start_date <= target_date:
        return start_date, target_date
    return target_date, target_date


def reminders_body(reminder_days_before):
    if reminder_days_before is None:
        return {"useDefault": True}
    if reminder_days_before < 1:
        return {"useDefault": False, "overrides": []}
    # All-day reminders count minutes back from 00:00 of the first day:
    # N days before at 09:00 = N * 24h - 9h.
    return {"useDefault": False, "overrides": [{"method": "popup", "minutes": reminder_days_before * 1440 - 540}]}


def build_issue_event_body(
    *, issue_id, name, start_date, target_date, priority, url, color_by_priority, reminder_days_before
):
    first_day, last_day = issue_date_range(start_date, target_date)
    return {
        "summary": name,
        "description": (
            f"Sincronizado com o Pespo Hub. Mover o evento ou renomear aqui atualiza o item de trabalho.\n\n{url}"
        ),
        "start": {"date": first_day.isoformat()},
        # Google's all-day end date is exclusive.
        "end": {"date": (last_day + timedelta(days=1)).isoformat()},
        "status": "confirmed",
        # A due date shouldn't make the person show up as busy.
        "transparency": "transparent",
        "colorId": PRIORITY_COLOR_IDS.get(priority) if color_by_priority else None,
        "reminders": reminders_body(reminder_days_before),
        "extendedProperties": {"private": {ISSUE_PROPERTY: str(issue_id)}},
        "source": {"title": "Pespo Hub", "url": url},
    }


def _parse_event_day(value, is_end):
    if value.get("date"):
        day = date.fromisoformat(value["date"])
        # All-day end is exclusive.
        return day - timedelta(days=1) if is_end else day
    if value.get("dateTime"):
        return datetime.fromisoformat(value["dateTime"].replace("Z", "+00:00")).date()
    return None


def event_date_range(event):
    """(first_day, last_day) of a Google event, inclusive. Timed events
    (the user dragged the all-day event into a time slot) count by date."""
    first_day = _parse_event_day(event.get("start") or {}, is_end=False)
    last_day = _parse_event_day(event.get("end") or {}, is_end=True)
    if first_day and (not last_day or last_day < first_day):
        last_day = first_day
    return first_day, last_day


def dates_from_event_range(first_day, last_day, had_start_date):
    """(start_date, target_date) to store on the work item after the event
    moved to [first_day, last_day]. A single-day event on a work item that
    never had a start date keeps it without one."""
    if first_day == last_day and not had_start_date:
        return None, last_day
    return first_day, last_day
