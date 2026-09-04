# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid
from datetime import timedelta

# Django imports
from django.http import HttpResponseRedirect
from django.utils import timezone
from django.views import View

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.views.base import BaseAPIView
from plane.authentication.adapter.error import AuthenticationException
from plane.authentication.provider.oauth.google_calendar import GoogleCalendarOAuthProvider
from plane.bgtasks.google_calendar_sync_task import sync_user_calendar
from plane.db.models import GoogleCalendarConnection
from plane.utils import google_calendar as gcal
from plane.utils.exception_logger import log_exception


def _frontend_redirect(request, query=""):
    scheme = "https" if request.is_secure() else "http"
    base = f"{scheme}://{request.get_host()}"
    return HttpResponseRedirect(f"{base}/settings/profile/google-calendar/{query}")


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

        if not code or state != request.session.get("google_calendar_state"):
            return _frontend_redirect(request, "?google_calendar=error")

        try:
            provider = GoogleCalendarOAuthProvider(request=request, code=code)
            token_data = provider.exchange_code_for_tokens()
            google_email = provider.fetch_google_email()

            connection, _ = GoogleCalendarConnection.objects.get_or_create(user=request.user)
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

        return _frontend_redirect(request, "?google_calendar=connected")


class GoogleCalendarStatusEndpoint(BaseAPIView):
    def get(self, request):
        connection = GoogleCalendarConnection.objects.filter(user=request.user).first()
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
                "sync_enabled": connection.sync_enabled,
                "plane_calendar_id": connection.plane_calendar_id,
                "overlay_calendar_ids": connection.overlay_calendar_ids,
                "last_synced_at": connection.last_synced_at,
                "calendars": [
                    {"id": c.get("id"), "summary": c.get("summary"), "primary": c.get("primary", False)}
                    for c in calendars
                ],
            },
            status=status.HTTP_200_OK,
        )


class GoogleCalendarPreferencesEndpoint(BaseAPIView):
    def patch(self, request):
        connection = GoogleCalendarConnection.objects.filter(user=request.user).first()
        if not connection:
            return Response({"error": "Not connected"}, status=status.HTTP_404_NOT_FOUND)

        if "sync_enabled" in request.data:
            connection.sync_enabled = bool(request.data["sync_enabled"])
        if "overlay_calendar_ids" in request.data:
            connection.overlay_calendar_ids = list(request.data["overlay_calendar_ids"])
        connection.save()

        return Response({"sync_enabled": connection.sync_enabled, "overlay_calendar_ids": connection.overlay_calendar_ids}, status=status.HTTP_200_OK)


class GoogleCalendarDisconnectEndpoint(BaseAPIView):
    def delete(self, request):
        connection = GoogleCalendarConnection.objects.filter(user=request.user).first()
        if not connection:
            return Response(status=status.HTTP_204_NO_CONTENT)

        gcal.revoke_token(connection)
        connection.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GoogleCalendarSyncNowEndpoint(BaseAPIView):
    def post(self, request):
        connection = GoogleCalendarConnection.objects.filter(user=request.user).first()
        if not connection:
            return Response({"error": "Not connected"}, status=status.HTTP_404_NOT_FOUND)

        sync_user_calendar.delay(str(connection.id))
        return Response({"queued": True}, status=status.HTTP_202_ACCEPTED)


class GoogleCalendarEventsEndpoint(BaseAPIView):
    def get(self, request):
        connection = GoogleCalendarConnection.objects.filter(user=request.user).first()
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
                events.extend(gcal.list_events(access_token, calendar_id, time_min, time_max))
            except Exception as e:
                log_exception(e)
                continue

        return Response(events, status=status.HTTP_200_OK)
