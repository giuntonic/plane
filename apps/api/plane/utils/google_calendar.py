# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Small client for the Google Calendar API, shared between the personal
OAuth views (apps/api/plane/app/views/user/google_calendar.py) and the
periodic sync task (apps/api/plane/bgtasks/google_calendar_sync_task.py).
Callers always pass a GoogleCalendarConnection — this module never touches
request/session state."""

import os
from datetime import timedelta

import requests
from django.utils import timezone

from plane.license.utils.instance_value import get_configuration_value

TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3"


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


def list_events(access_token, calendar_id, time_min, time_max):
    response = requests.get(
        f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events",
        headers=_headers(access_token),
        params={
            "timeMin": time_min,
            "timeMax": time_max,
            "singleEvents": "true",
            "orderBy": "startTime",
        },
        timeout=15,
    )
    response.raise_for_status()
    return response.json().get("items", [])


def upsert_event(access_token, calendar_id, event_id, summary, description, start_date, end_date):
    """Deterministic create-or-update by id — same dance validated in the
    original n8n workflow: try create with an explicit id, fall back to
    update when it already exists."""
    body = {
        "id": event_id,
        "summary": summary,
        "description": description,
        "start": {"date": start_date},
        "end": {"date": end_date},
    }
    create_response = requests.post(
        f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events",
        headers=_headers(access_token),
        json=body,
        timeout=15,
    )
    if create_response.status_code in (200, 201):
        return create_response.json()

    update_response = requests.patch(
        f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events/{event_id}",
        headers=_headers(access_token),
        json={k: v for k, v in body.items() if k != "id"},
        timeout=15,
    )
    update_response.raise_for_status()
    return update_response.json()


def delete_event(access_token, calendar_id, event_id):
    response = requests.delete(
        f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events/{event_id}",
        headers=_headers(access_token),
        timeout=15,
    )
    # 404/410 just means it's already gone — treat as success either way.
    if response.status_code not in (200, 204, 404, 410):
        response.raise_for_status()
