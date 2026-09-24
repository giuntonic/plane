# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
import uuid
from datetime import date, datetime, timedelta

# Django imports
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.utils import timezone

# Third Party imports
import requests
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import GoogleCalendarConnection, Issue, IssueCalendarEvent
from plane.utils import google_calendar as gcal
from plane.utils.exception_logger import log_exception
from plane.utils.host import base_host

MAX_ATTENDEES = 100
# The requester's own meetings are refreshed from Google at most this often.
REFRESH_INTERVAL = timedelta(minutes=5)


def _issue_url(issue):
    return f"{settings.WEB_URL}/{issue.workspace.slug}/browse/{issue.project.identifier}-{issue.sequence_id}/"


def _parse_event_time(value):
    """(datetime, all_day) from a Google start/end object."""
    if not value:
        return None, False
    if value.get("dateTime"):
        return datetime.fromisoformat(value["dateTime"].replace("Z", "+00:00")), False
    if value.get("date"):
        day = date.fromisoformat(value["date"])
        return timezone.make_aware(datetime(day.year, day.month, day.day)), True
    return None, False


def _meet_link(event):
    if event.get("hangoutLink"):
        return event["hangoutLink"]
    for entry in (event.get("conferenceData") or {}).get("entryPoints", []):
        if entry.get("entryPointType") == "video" and entry.get("uri"):
            return entry["uri"]
    return ""


def _fill_from_event(row, event):
    row.summary = (event.get("summary") or "")[:1024]
    row.start, row.all_day = _parse_event_time(event.get("start"))
    row.end, _ = _parse_event_time(event.get("end"))
    row.html_link = event.get("htmlLink", "")
    row.meet_link = _meet_link(event)
    row.attendees = [
        {
            "email": a.get("email"),
            "display_name": a.get("displayName"),
            "response_status": a.get("responseStatus"),
            "organizer": bool(a.get("organizer")),
        }
        for a in event.get("attendees", [])
        if a.get("email")
    ]


def _serialize(row, user):
    return {
        "id": str(row.id),
        "issue": str(row.issue_id),
        "google_event_id": row.google_event_id,
        "calendar_id": row.calendar_id,
        "summary": row.summary,
        "start": row.start,
        "end": row.end,
        "all_day": row.all_day,
        "html_link": row.html_link,
        "meet_link": row.meet_link,
        "attendees": row.attendees,
        "created_by": str(row.created_by_id) if row.created_by_id else None,
        "is_owner": row.created_by_id == user.id,
    }


def _connection_error():
    return Response(
        {"error": "Google Calendar is not connected", "code": "GOOGLE_CALENDAR_NOT_CONNECTED"},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _google_error(error):
    if isinstance(error, requests.HTTPError) and error.response is not None:
        if error.response.status_code in (401, 403):
            return Response(
                {"error": "Google Calendar denied access", "code": "GOOGLE_CALENDAR_FORBIDDEN"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if error.response.status_code == 404:
            return Response(
                {"error": "Event not found", "code": "GOOGLE_CALENDAR_NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
    log_exception(error)
    return Response(
        {"error": "Google Calendar request failed", "code": "GOOGLE_CALENDAR_ERROR"},
        status=status.HTTP_502_BAD_GATEWAY,
    )


def _log_activity(request, issue, verb, url):
    issue_activity.delay(
        type=f"link.activity.{verb}",
        requested_data=json.dumps({"id": str(issue.id), "url": url}) if verb == "created" else None,
        actor_id=str(request.user.id),
        issue_id=str(issue.id),
        project_id=str(issue.project_id),
        current_instance=json.dumps({"url": url}) if verb == "deleted" else None,
        epoch=int(timezone.now().timestamp()),
        notification=True,
        origin=base_host(request=request, is_app=True),
    )


def _parse_time_input(value, all_day):
    """Validates a start/end sent by the frontend: a date (YYYY-MM-DD) for
    all-day meetings, an ISO datetime with offset otherwise."""
    if not isinstance(value, str):
        raise ValueError("invalid")
    if all_day:
        return {"date": date.fromisoformat(value).isoformat()}
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timezone required")
    return {"dateTime": parsed.isoformat()}


class IssueCalendarEventEndpoint(BaseAPIView):
    """Google Calendar events (meetings) linked to a work item."""

    def _get_issue(self, slug, project_id, issue_id):
        return (
            Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id)
            .select_related("project", "workspace")
            .first()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        rows = list(IssueCalendarEvent.objects.filter(workspace__slug=slug, project_id=project_id, issue_id=issue_id))

        # Keep the requester's own meetings fresh (rescheduled / cancelled /
        # RSVPs in Google). Other people's meetings are refreshed when their
        # organiser opens the work item.
        connection = GoogleCalendarConnection.objects.filter(user=request.user).first()
        stale_before = timezone.now() - REFRESH_INTERVAL
        own_stale = [r for r in rows if r.created_by_id == request.user.id and r.updated_at < stale_before]
        if connection and own_stale:
            try:
                access_token = gcal.get_valid_access_token(connection)
                for row in own_stale[:10]:
                    try:
                        event = gcal.get_event(access_token, row.calendar_id, row.google_event_id)
                    except requests.HTTPError as e:
                        if e.response is not None and e.response.status_code in (404, 410):
                            row.delete(soft=False)
                            rows.remove(row)
                        continue
                    if event.get("status") == "cancelled":
                        row.delete(soft=False)
                        rows.remove(row)
                        continue
                    _fill_from_event(row, event)
                    row.save()
            except Exception as e:
                log_exception(e)

        rows.sort(key=lambda r: r.start or timezone.now())
        return Response([_serialize(r, request.user) for r in rows], status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        """Schedules a new meeting in the requester's Google Calendar, with
        optional Google Meet link and invitations, linked to the work item."""
        issue = self._get_issue(slug, project_id, issue_id)
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        connection = GoogleCalendarConnection.objects.filter(user=request.user).first()
        if not connection:
            return _connection_error()

        all_day = bool(request.data.get("all_day"))
        try:
            start = _parse_time_input(request.data.get("start"), all_day)
            end = _parse_time_input(request.data.get("end"), all_day)
        except ValueError:
            return Response({"error": "Invalid start/end"}, status=status.HTTP_400_BAD_REQUEST)
        if (start.get("date") or start.get("dateTime")) > (end.get("date") or end.get("dateTime")):
            return Response({"error": "End must be after start"}, status=status.HTTP_400_BAD_REQUEST)
        if all_day:
            # Google's all-day end is exclusive; the form sends the last day.
            end = {"date": (date.fromisoformat(end["date"]) + timedelta(days=1)).isoformat()}

        attendees = request.data.get("attendees") or []
        if not isinstance(attendees, list) or len(attendees) > MAX_ATTENDEES:
            return Response({"error": "Invalid attendees"}, status=status.HTTP_400_BAD_REQUEST)
        emails = []
        for email in attendees:
            try:
                validate_email(email)
            except (ValidationError, TypeError):
                return Response({"error": f"Invalid email: {email}"}, status=status.HTTP_400_BAD_REQUEST)
            if email.lower() not in {e.lower() for e in emails}:
                emails.append(email)

        calendar_id = request.data.get("calendar_id") or "primary"
        summary = (request.data.get("summary") or issue.name).strip()[:1024]
        description = (request.data.get("description") or "").strip()
        body = {
            "summary": summary,
            "description": f"{description}\n\n{_issue_url(issue)}".strip(),
            "start": start,
            "end": end,
            "attendees": [{"email": e} for e in emails],
            "extendedProperties": {"private": {gcal.ISSUE_PROPERTY: str(issue.id)}},
            "source": {"title": f"{issue.project.identifier}-{issue.sequence_id}", "url": _issue_url(issue)},
        }
        with_meet = bool(request.data.get("with_meet", True))
        if with_meet:
            body["conferenceData"] = {
                "createRequest": {"requestId": uuid.uuid4().hex, "conferenceSolutionKey": {"type": "hangoutsMeet"}}
            }

        try:
            access_token = gcal.get_valid_access_token(connection)
            event = gcal.create_event(access_token, calendar_id, body, with_meet=with_meet, send_updates="all")
        except Exception as e:
            return _google_error(e)

        row = IssueCalendarEvent(
            issue=issue,
            project_id=issue.project_id,
            workspace_id=issue.workspace_id,
            google_event_id=event["id"],
            calendar_id=calendar_id,
        )
        _fill_from_event(row, event)
        row.save()
        _log_activity(request, issue, "created", row.html_link)
        return Response(_serialize(row, request.user), status=status.HTTP_201_CREATED)


class IssueCalendarEventLinkEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        """Links an existing Google event (e.g. the one a work item was just
        created from, in the calendar view) to the work item."""
        issue = (
            Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id)
            .select_related("project", "workspace")
            .first()
        )
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        connection = GoogleCalendarConnection.objects.filter(user=request.user).first()
        if not connection:
            return _connection_error()

        event_id = request.data.get("google_event_id")
        calendar_id = request.data.get("calendar_id") or "primary"
        if not isinstance(event_id, str) or not event_id or not isinstance(calendar_id, str):
            return Response({"error": "google_event_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        existing = IssueCalendarEvent.objects.filter(issue=issue, google_event_id=event_id).first()
        if existing:
            return Response(_serialize(existing, request.user), status=status.HTTP_200_OK)

        try:
            access_token = gcal.get_valid_access_token(connection)
            event = gcal.get_event(access_token, calendar_id, event_id)
        except Exception as e:
            return _google_error(e)

        # Tag the event so it shows up linked for everyone; needs write
        # access to it, so failing here isn't an error.
        try:
            private = {**((event.get("extendedProperties") or {}).get("private") or {})}
            private[gcal.ISSUE_PROPERTY] = str(issue.id)
            event = gcal.patch_event(access_token, calendar_id, event_id, {"extendedProperties": {"private": private}})
        except requests.HTTPError:
            pass

        row = IssueCalendarEvent(
            issue=issue,
            project_id=issue.project_id,
            workspace_id=issue.workspace_id,
            google_event_id=event_id,
            calendar_id=calendar_id,
        )
        _fill_from_event(row, event)
        row.save()
        _log_activity(request, issue, "created", row.html_link)
        return Response(_serialize(row, request.user), status=status.HTTP_201_CREATED)


class IssueCalendarEventDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], creator=True, model=IssueCalendarEvent)
    def delete(self, request, slug, project_id, issue_id, pk):
        """Unlinks the meeting. With ?cancel=true and when the requester
        organised it, also cancels it in Google (attendees get notified)."""
        row = IssueCalendarEvent.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=pk
        ).first()
        if not row:
            return Response(status=status.HTTP_204_NO_CONTENT)

        if request.query_params.get("cancel") == "true" and row.created_by_id == request.user.id:
            connection = GoogleCalendarConnection.objects.filter(user=request.user).first()
            if not connection:
                return _connection_error()
            try:
                access_token = gcal.get_valid_access_token(connection)
                gcal.delete_event(access_token, row.calendar_id, row.google_event_id, send_updates="all")
            except Exception as e:
                return _google_error(e)

        issue = Issue.objects.filter(pk=issue_id).first()
        if issue:
            _log_activity(request, issue, "deleted", row.html_link)
        row.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
