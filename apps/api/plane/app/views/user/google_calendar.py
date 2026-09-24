# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import hmac
import uuid
from datetime import timedelta

# Django imports
from django.http import HttpResponse, HttpResponseRedirect
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.views.base import BaseAPIView
from plane.authentication.adapter.error import AuthenticationException
from plane.authentication.provider.oauth.google_calendar import GoogleCalendarOAuthProvider
from plane.bgtasks.google_calendar_sync_task import (
    notification_address,
    pull_calendar_changes,
    sync_user_calendar,
    teardown_connection,
)
from plane.db.models import GoogleCalendarConnection, Issue, IssueCalendarEvent, ProjectMember
from plane.settings.redis import redis_instance
from plane.utils import google_calendar as gcal
from plane.utils.exception_logger import log_exception

# Preference fields the settings page can change, with their validators.
BOOLEAN_PREFERENCES = ("sync_enabled", "two_way_sync", "calendar_per_project", "color_by_priority")
# A preference change that alters which events exist / where / how they
# look triggers an immediate full sync.
RESYNC_PREFERENCES = {"sync_enabled", "calendar_per_project", "color_by_priority", "sync_project_ids"}
RESYNC_PREFERENCES |= {"reminder_days_before", "two_way_sync"}


def _frontend_redirect(request, query=""):
    scheme = "https" if request.is_secure() else "http"
    base = f"{scheme}://{request.get_host()}"
    return HttpResponseRedirect(f"{base}/settings/profile/google-calendar/{query}")


def _get_connection(user):
    return GoogleCalendarConnection.objects.filter(user=user).first()


def _user_projects(user):
    return [
        {
            "id": str(row["project_id"]),
            "name": row["project__name"],
            "identifier": row["project__identifier"],
            "workspace_slug": row["project__workspace__slug"],
            "workspace_name": row["project__workspace__name"],
        }
        for row in ProjectMember.objects.filter(
            member=user, is_active=True, project__archived_at__isnull=True, project__deleted_at__isnull=True
        )
        .values(
            "project_id", "project__name", "project__identifier", "project__workspace__slug", "project__workspace__name"
        )
        .order_by("project__workspace__name", "project__name")
    ]


def _preferences(connection):
    return {
        "sync_enabled": connection.sync_enabled,
        "two_way_sync": connection.two_way_sync,
        "calendar_per_project": connection.calendar_per_project,
        "color_by_priority": connection.color_by_priority,
        "reminder_days_before": connection.reminder_days_before,
        "sync_project_ids": connection.sync_project_ids,
        "overlay_calendar_ids": connection.overlay_calendar_ids,
    }


class GoogleCalendarConnectEndpoint(View):
    def get(self, request):
        if not request.user.is_authenticated:
            return HttpResponseRedirect("/")

        state = uuid.uuid4().hex
        request.session["google_calendar_state"] = state
        try:
            provider = GoogleCalendarOAuthProvider(request=request, state=state)
            return HttpResponseRedirect(provider.get_auth_url())
        except AuthenticationException:
            return _frontend_redirect(request, "?google_calendar=not_configured")


class GoogleCalendarCallbackEndpoint(View):
    def get(self, request):
        if not request.user.is_authenticated:
            return HttpResponseRedirect("/")

        code = request.GET.get("code")
        state = request.GET.get("state")
        # One-shot: a state value can't be replayed.
        expected_state = request.session.pop("google_calendar_state", None)

        if not code or not expected_state or state != expected_state:
            return _frontend_redirect(request, "?google_calendar=error")

        try:
            provider = GoogleCalendarOAuthProvider(request=request, code=code)
            token_data = provider.exchange_code_for_tokens()
            google_email = provider.fetch_google_email()

            # all_objects: a connection soft-deleted by an older version of
            # the disconnect still owns the OneToOne slot — revive it
            # instead of failing with an IntegrityError.
            connection = GoogleCalendarConnection.all_objects.filter(user=request.user).first()
            if connection is None:
                connection = GoogleCalendarConnection(user=request.user)
            elif connection.deleted_at is not None:
                connection.deleted_at = None
                connection.plane_calendar_id = ""
                connection.project_calendar_ids = {}
                connection.sync_tokens = {}
                connection.watch_channels = []
                connection.overlay_calendar_ids = []
                connection.synced_events.all().delete(soft=False)

            connection.google_email = google_email
            connection.access_token = token_data.get("access_token")
            # Google only returns a refresh_token on the very first consent —
            # keep the existing one on reconnects where it's omitted.
            if token_data.get("refresh_token"):
                connection.refresh_token = token_data.get("refresh_token")
            connection.token_expires_at = timezone.now() + timedelta(seconds=token_data.get("expires_in", 3600))

            if not connection.plane_calendar_id:
                connection.plane_calendar_id = gcal.create_dedicated_calendar(connection.access_token)
                connection.overlay_calendar_ids = [connection.plane_calendar_id]

            connection.save()
        except Exception as e:
            log_exception(e)
            return _frontend_redirect(request, "?google_calendar=error")

        # First sync right away instead of waiting for the next beat.
        sync_user_calendar.delay(str(connection.id))
        return _frontend_redirect(request, "?google_calendar=connected")


class GoogleCalendarStatusEndpoint(BaseAPIView):
    def get(self, request):
        connection = _get_connection(request.user)
        if not connection:
            return Response({"connected": False}, status=status.HTTP_200_OK)

        try:
            access_token = gcal.get_valid_access_token(connection)
            calendars = gcal.list_calendars(access_token)
        except Exception as e:
            log_exception(e)
            calendars = []

        return Response(
            {
                "connected": True,
                "google_email": connection.google_email,
                "plane_calendar_id": connection.plane_calendar_id,
                "project_calendar_ids": connection.project_calendar_ids,
                "last_synced_at": connection.last_synced_at,
                "realtime_enabled": bool(notification_address()) and bool(connection.watch_channels),
                **_preferences(connection),
                "calendars": [
                    {
                        "id": c.get("id"),
                        "summary": c.get("summaryOverride") or c.get("summary"),
                        "primary": c.get("primary", False),
                        "background_color": c.get("backgroundColor"),
                        "access_role": c.get("accessRole"),
                    }
                    for c in calendars
                ],
                "projects": _user_projects(request.user),
            },
            status=status.HTTP_200_OK,
        )


class GoogleCalendarPreferencesEndpoint(BaseAPIView):
    def patch(self, request):
        connection = _get_connection(request.user)
        if not connection:
            return Response({"error": "Not connected"}, status=status.HTTP_404_NOT_FOUND)

        changed = set()
        for field in BOOLEAN_PREFERENCES:
            if field in request.data:
                setattr(connection, field, bool(request.data[field]))
                changed.add(field)

        if "overlay_calendar_ids" in request.data:
            value = request.data["overlay_calendar_ids"]
            if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
                return Response({"error": "overlay_calendar_ids must be a list"}, status=status.HTTP_400_BAD_REQUEST)
            connection.overlay_calendar_ids = value
            changed.add("overlay_calendar_ids")

        if "sync_project_ids" in request.data:
            value = request.data["sync_project_ids"]
            if not isinstance(value, list):
                return Response({"error": "sync_project_ids must be a list"}, status=status.HTTP_400_BAD_REQUEST)
            # Only projects the user belongs to.
            allowed = {p["id"] for p in _user_projects(request.user)}
            connection.sync_project_ids = [str(v) for v in value if str(v) in allowed]
            changed.add("sync_project_ids")

        if "reminder_days_before" in request.data:
            value = request.data["reminder_days_before"]
            if value is not None and (
                not isinstance(value, int) or isinstance(value, bool) or value < -1 or value > 30
            ):
                return Response(
                    {"error": "reminder_days_before must be null, -1 or 1-30"}, status=status.HTTP_400_BAD_REQUEST
                )
            connection.reminder_days_before = None if value == 0 else value
            changed.add("reminder_days_before")

        connection.save()
        if changed & RESYNC_PREFERENCES and connection.sync_enabled:
            sync_user_calendar.delay(str(connection.id))

        return Response(_preferences(connection), status=status.HTTP_200_OK)


class GoogleCalendarDisconnectEndpoint(BaseAPIView):
    def delete(self, request):
        connection = _get_connection(request.user)
        if not connection:
            return Response(status=status.HTTP_204_NO_CONTENT)

        teardown_connection(connection)
        gcal.revoke_token(connection)
        # Hard delete: a soft-deleted row would keep the (encrypted) tokens
        # around and block reconnecting through the OneToOne on user.
        connection.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class GoogleCalendarSyncNowEndpoint(BaseAPIView):
    def post(self, request):
        connection = _get_connection(request.user)
        if not connection:
            return Response({"error": "Not connected"}, status=status.HTTP_404_NOT_FOUND)

        sync_user_calendar.delay(str(connection.id))
        return Response({"queued": True}, status=status.HTTP_202_ACCEPTED)


def _attach_plane_issues(user, events):
    """Adds `plane_issue` to events linked to a work item the user can see
    (synced due-date events and meetings), and `plane_kind`:
    "task" for the work item's own due-date event, "meeting" for a linked
    meeting, None for anything else."""
    event_issue_ids = {}
    for event in events:
        issue_id = ((event.get("extendedProperties") or {}).get("private") or {}).get(gcal.ISSUE_PROPERTY)
        if issue_id:
            event_issue_ids[event.get("id")] = issue_id

    linked = IssueCalendarEvent.objects.filter(google_event_id__in=[e.get("id") for e in events if e.get("id")])
    for row in linked.values("google_event_id", "issue_id"):
        event_issue_ids.setdefault(row["google_event_id"], str(row["issue_id"]))

    valid_ids = set()
    for value in event_issue_ids.values():
        try:
            valid_ids.add(uuid.UUID(str(value)))
        except ValueError:
            continue

    issues = {
        str(row["id"]): row
        for row in Issue.issue_objects.filter(
            pk__in=valid_ids,
            project__project_projectmember__member=user,
            project__project_projectmember__is_active=True,
        )
        .values("id", "name", "sequence_id", "project_id", "project__identifier", "workspace__slug", "completed_at")
        .distinct()
    }

    for event in events:
        issue = issues.get(str(event_issue_ids.get(event.get("id"), "")))
        if not issue:
            event["plane_issue"] = None
            event["plane_kind"] = None
            continue
        event["plane_issue"] = {
            "id": str(issue["id"]),
            "name": issue["name"],
            "sequence_id": issue["sequence_id"],
            "project_id": str(issue["project_id"]),
            "project_identifier": issue["project__identifier"],
            "workspace_slug": issue["workspace__slug"],
            "is_completed": issue["completed_at"] is not None,
        }
        event["plane_kind"] = "task" if event.get("id") == gcal.issue_event_id(issue["id"]) else "meeting"
    return events


class GoogleCalendarEventsEndpoint(BaseAPIView):
    def get(self, request):
        connection = _get_connection(request.user)
        if not connection or not connection.overlay_calendar_ids:
            return Response([], status=status.HTTP_200_OK)

        time_min = request.GET.get("after")
        time_max = request.GET.get("before")
        if not time_min or not time_max:
            return Response({"error": "after and before are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            access_token = gcal.get_valid_access_token(connection)
        except Exception as e:
            log_exception(e)
            return Response({"error": "Failed to refresh Google token"}, status=status.HTTP_502_BAD_GATEWAY)

        events = []
        for calendar_id in connection.overlay_calendar_ids:
            try:
                for event in gcal.list_events(access_token, calendar_id, time_min, time_max):
                    event["calendar_id"] = calendar_id
                    events.append(event)
            except Exception as e:
                log_exception(e)
                continue

        return Response(_attach_plane_issues(request.user, events), status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name="dispatch")
class GoogleCalendarNotificationEndpoint(View):
    """Receives Google Calendar push notifications (events.watch). No user
    session: the channel id identifies the connection and the per-channel
    secret token (sent back by Google in X-Goog-Channel-Token) proves the
    request came from the channel we registered."""

    def post(self, request):
        channel_id = request.headers.get("X-Goog-Channel-ID", "")
        channel_token = request.headers.get("X-Goog-Channel-Token", "")
        resource_state = request.headers.get("X-Goog-Resource-State", "")
        if not channel_id or not channel_token:
            return HttpResponse(status=400)

        connection = GoogleCalendarConnection.objects.filter(watch_channels__contains=[{"id": channel_id}]).first()
        channel = next(
            (c for c in (connection.watch_channels if connection else []) if c.get("id") == channel_id), None
        )
        if not channel or not hmac.compare_digest(str(channel.get("token", "")), channel_token):
            # Unknown/stale channel: 404 makes Google stop retrying it.
            return HttpResponse(status=404)

        # "sync" is just the handshake Google sends when the channel opens.
        if resource_state != "sync" and connection.two_way_sync and connection.sync_enabled:
            # Google sends one notification per changed event; collapse a
            # burst into a single pull.
            try:
                should_pull = redis_instance().set(f"gcal-pull:{connection.id}", "1", nx=True, ex=5)
            except Exception:
                should_pull = True
            if should_pull:
                pull_calendar_changes.apply_async(args=[str(connection.id)], countdown=3)

        return HttpResponse(status=200)
