# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the Google Calendar integration: reconnect after
disconnect, two-way sync (push/pull), per-issue sync, preferences, the push
notification receiver and meetings linked to work items. Google itself is
never called — the Google Calendar client functions are patched."""

from datetime import date, timedelta
from unittest import mock

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.bgtasks import google_calendar_sync_task as sync
from plane.db.models import (
    GoogleCalendarConnection,
    Issue,
    IssueAssignee,
    IssueCalendarEvent,
    Project,
    ProjectMember,
    State,
    SyncedCalendarEvent,
    User,
    WorkspaceMember,
)
from plane.utils import google_calendar as gcal

GCAL = "plane.utils.google_calendar"


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Cal Project", identifier="CAL", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def state(db, project):
    return State.objects.create(name="Todo", group="unstarted", project=project, workspace=project.workspace)


@pytest.fixture
def issue(db, project, state, create_user):
    issue = Issue.objects.create(
        name="Entregar arte",
        project=project,
        workspace=project.workspace,
        state=state,
        target_date=date(2026, 9, 10),
        priority="high",
    )
    IssueAssignee.objects.create(issue=issue, assignee=create_user, project=project, workspace=project.workspace)
    return issue


@pytest.fixture
def connection(db, create_user):
    connection = GoogleCalendarConnection(user=create_user, google_email="me@gmail.com", plane_calendar_id="plane-cal")
    connection.access_token = "access"
    connection.refresh_token = "refresh"
    connection.token_expires_at = timezone.now() + timedelta(hours=1)
    connection.overlay_calendar_ids = ["plane-cal"]
    connection.save()
    return connection


@pytest.fixture
def google():
    """Patches every Google call made by the sync engine."""
    with (
        mock.patch(f"{GCAL}.upsert_event", return_value={}) as upsert,
        mock.patch(f"{GCAL}.delete_event") as delete,
        mock.patch(f"{GCAL}.calendar_exists", return_value=True),
        mock.patch(f"{GCAL}.create_dedicated_calendar", return_value="new-cal") as create_calendar,
        mock.patch(f"{GCAL}.list_changed_events", return_value=([], "sync-1")) as list_changed,
        mock.patch(f"{GCAL}.watch_events", return_value={"resourceId": "r1", "expiration": "9999999999999"}),
        mock.patch(f"{GCAL}.stop_channel"),
        mock.patch("plane.bgtasks.issue_activities_task.issue_activity") as activity,
        mock.patch("plane.db.mixins.soft_delete_related_objects"),
    ):
        yield {
            "upsert": upsert,
            "delete": delete,
            "create_calendar": create_calendar,
            "list_changed": list_changed,
            "activity": activity,
        }


def _google_event(issue, first_day, last_day, summary=None, status_="confirmed"):
    return {
        "id": gcal.issue_event_id(issue.id),
        "status": status_,
        "summary": summary or issue.name,
        "start": {"date": first_day.isoformat()},
        "end": {"date": (last_day + timedelta(days=1)).isoformat()},
    }


@pytest.mark.contract
class TestReconnect:
    @pytest.mark.django_db
    def test_disconnect_hard_deletes_and_stops_channels(self, session_client, connection):
        connection.watch_channels = [{"id": "c1", "resource_id": "r1", "calendar_id": "plane-cal"}]
        connection.save()
        with mock.patch(f"{GCAL}.revoke_token"), mock.patch(f"{GCAL}.stop_channel") as stop:
            response = session_client.delete(reverse("google-calendar-disconnect"))
        assert response.status_code == status.HTTP_204_NO_CONTENT
        stop.assert_called_once_with("access", "c1", "r1")
        assert not GoogleCalendarConnection.all_objects.filter(pk=connection.pk).exists()

    @pytest.mark.django_db
    def test_reconnect_revives_a_connection_soft_deleted_by_the_old_code(self, create_user, connection):
        # What the old disconnect left behind: a soft-deleted row still
        # owning the user's OneToOne slot.
        GoogleCalendarConnection.all_objects.filter(pk=connection.pk).update(deleted_at=timezone.now())
        client = APIClient()
        client.force_login(create_user)
        session = client.session
        session["google_calendar_state"] = "st"
        session.save()

        provider = mock.Mock()
        provider.exchange_code_for_tokens.return_value = {"access_token": "new", "expires_in": 3600}
        provider.fetch_google_email.return_value = "me@gmail.com"
        with (
            mock.patch("plane.app.views.user.google_calendar.GoogleCalendarOAuthProvider", return_value=provider),
            mock.patch(f"{GCAL}.create_dedicated_calendar", return_value="fresh-cal"),
            mock.patch("plane.app.views.user.google_calendar.sync_user_calendar") as sync_task,
        ):
            response = client.get(reverse("google-calendar-callback"), {"code": "c", "state": "st"})

        assert response["Location"].endswith("?google_calendar=connected")
        revived = GoogleCalendarConnection.objects.get(user=create_user)
        assert revived.pk == connection.pk
        assert revived.plane_calendar_id == "fresh-cal"
        assert revived.access_token == "new"
        sync_task.delay.assert_called_once()

    @pytest.mark.django_db
    def test_callback_state_is_single_use(self, create_user):
        client = APIClient()
        client.force_login(create_user)
        session = client.session
        session["google_calendar_state"] = "st"
        session.save()
        with mock.patch("plane.app.views.user.google_calendar.GoogleCalendarOAuthProvider") as provider:
            provider.side_effect = RuntimeError("boom")
            client.get(reverse("google-calendar-callback"), {"code": "c", "state": "st"})
            response = client.get(reverse("google-calendar-callback"), {"code": "c", "state": "st"})
        assert response["Location"].endswith("?google_calendar=error")
        assert provider.call_count == 1


@pytest.mark.contract
class TestPush:
    @pytest.mark.django_db
    def test_full_sync_pushes_multi_day_event_and_records_it(self, connection, issue, google):
        issue.start_date = date(2026, 9, 8)
        issue.save()
        sync.sync_user_calendar(str(connection.id))

        calendar_id, event_id, body = google["upsert"].call_args.args[1:]
        assert (calendar_id, event_id) == ("plane-cal", gcal.issue_event_id(issue.id))
        assert body["start"] == {"date": "2026-09-08"} and body["end"] == {"date": "2026-09-11"}
        assert body["colorId"] == "6"
        synced = SyncedCalendarEvent.objects.get(connection=connection, issue=issue)
        assert (synced.pushed_start, synced.pushed_end, synced.pushed_summary) == (
            date(2026, 9, 8),
            date(2026, 9, 10),
            "Entregar arte",
        )
        connection.refresh_from_db()
        assert connection.last_synced_at is not None

    @pytest.mark.django_db
    def test_issue_that_leaves_and_comes_back_syncs_again(self, connection, issue, state, google):
        """Regression: stale events used to be soft-deleted, and the row kept
        the (connection, issue) unique slot, so re-syncing failed."""
        sync.sync_user_calendar(str(connection.id))
        issue.target_date = None
        issue.save()
        sync.sync_user_calendar(str(connection.id))
        assert not SyncedCalendarEvent.all_objects.filter(issue=issue).exists()
        google["delete"].assert_called_once()

        issue.target_date = date(2026, 9, 20)
        issue.save()
        sync.sync_user_calendar(str(connection.id))
        assert SyncedCalendarEvent.objects.get(issue=issue).pushed_end == date(2026, 9, 20)

    @pytest.mark.django_db
    def test_project_filter(self, connection, issue, google):
        connection.sync_project_ids = ["00000000-0000-0000-0000-000000000000"]
        connection.save()
        sync.sync_user_calendar(str(connection.id))
        google["upsert"].assert_not_called()

    @pytest.mark.django_db
    def test_calendar_per_project_creates_and_moves_event(self, connection, issue, google):
        sync.sync_user_calendar(str(connection.id))
        connection.calendar_per_project = True
        connection.save()
        sync.sync_user_calendar(str(connection.id))

        google["create_calendar"].assert_called_once_with("access", summary="Plane · Cal Project")
        assert google["upsert"].call_args.args[1] == "new-cal"
        # Removed from the shared calendar it used to live in.
        assert google["delete"].call_args.args[1] == "plane-cal"
        connection.refresh_from_db()
        assert connection.project_calendar_ids == {str(issue.project_id): "new-cal"}

    @pytest.mark.django_db
    def test_per_issue_sync_removes_completed_issue(self, connection, issue, project, google):
        sync.sync_user_calendar(str(connection.id))
        done = State.objects.create(name="Done", group="completed", project=project, workspace=project.workspace)
        issue.state = done
        issue.save()
        sync.sync_issue_calendar_events(str(issue.id))
        assert not SyncedCalendarEvent.objects.filter(issue=issue).exists()

    @pytest.mark.django_db
    def test_unassigned_user_loses_the_event(self, connection, issue, google):
        """Regression: removing an assignee soft-deletes IssueAssignee, and the
        old `assignees__in` query still matched it — the event never left."""
        sync.sync_user_calendar(str(connection.id))
        IssueAssignee.objects.filter(issue=issue).delete()  # soft delete, like the API
        assert IssueAssignee.all_objects.filter(issue=issue).exists()
        sync.sync_issue_calendar_events(str(issue.id))
        assert not SyncedCalendarEvent.objects.filter(issue=issue).exists()

    @pytest.mark.django_db
    def test_per_issue_sync_pushes_for_new_assignee(self, connection, issue, google):
        sync.sync_issue_calendar_events(str(issue.id))
        google["upsert"].assert_called_once()

    @pytest.mark.django_db
    def test_recreates_the_plane_calendar_if_deleted_in_google(self, connection, issue, google):
        with mock.patch(f"{GCAL}.calendar_exists", return_value=False):
            sync.sync_user_calendar(str(connection.id))
        connection.refresh_from_db()
        assert connection.plane_calendar_id == "new-cal"
        assert connection.overlay_calendar_ids == ["new-cal"]


@pytest.mark.contract
class TestPull:
    def _synced(self, connection, issue, first_day=date(2026, 9, 10), last_day=date(2026, 9, 10)):
        return SyncedCalendarEvent.objects.create(
            connection=connection,
            issue=issue,
            google_event_id=gcal.issue_event_id(issue.id),
            calendar_id="plane-cal",
            pushed_start=first_day,
            pushed_end=last_day,
            pushed_summary=issue.name,
        )

    @pytest.mark.django_db
    def test_moving_the_event_in_google_updates_the_work_item(self, connection, issue, google):
        self._synced(connection, issue)
        google["list_changed"].return_value = (
            [_google_event(issue, date(2026, 9, 14), date(2026, 9, 16), summary="Entregar arte v2")],
            "sync-2",
        )
        sync.pull_calendar_changes(str(connection.id))

        issue.refresh_from_db()
        assert (issue.start_date, issue.target_date, issue.name) == (
            date(2026, 9, 14),
            date(2026, 9, 16),
            "Entregar arte v2",
        )
        assert issue.updated_by_id == connection.user_id
        fields = sorted(
            next(iter(c.kwargs["requested_data"].strip("{}").split(":"))).strip('"')
            for c in google["activity"].delay.call_args_list
        )
        assert fields == ["name", "start_date", "target_date"]
        connection.refresh_from_db()
        assert connection.sync_tokens == {"plane-cal": "sync-2"}

    @pytest.mark.django_db
    def test_single_day_move_keeps_work_item_without_start_date(self, connection, issue, google):
        self._synced(connection, issue)
        google["list_changed"].return_value = ([_google_event(issue, date(2026, 9, 12), date(2026, 9, 12))], "s")
        sync.pull_calendar_changes(str(connection.id))
        issue.refresh_from_db()
        assert (issue.start_date, issue.target_date) == (None, date(2026, 9, 12))

    @pytest.mark.django_db
    def test_our_own_push_is_not_read_back(self, connection, issue, google):
        self._synced(connection, issue)
        google["list_changed"].return_value = ([_google_event(issue, date(2026, 9, 10), date(2026, 9, 10))], "s")
        sync.pull_calendar_changes(str(connection.id))
        google["activity"].delay.assert_not_called()

    @pytest.mark.django_db
    def test_deleted_in_google_does_not_touch_the_work_item(self, connection, issue, google):
        self._synced(connection, issue)
        google["list_changed"].return_value = (
            [_google_event(issue, date(2026, 9, 1), date(2026, 9, 1), status_="cancelled")],
            "s",
        )
        sync.pull_calendar_changes(str(connection.id))
        issue.refresh_from_db()
        assert issue.target_date == date(2026, 9, 10)

    @pytest.mark.django_db
    def test_guest_edits_in_google_are_not_applied(self, connection, issue, project, create_user, google):
        ProjectMember.objects.filter(project=project, member=create_user).update(role=5)
        self._synced(connection, issue)
        google["list_changed"].return_value = ([_google_event(issue, date(2026, 9, 20), date(2026, 9, 20))], "s")
        sync.pull_calendar_changes(str(connection.id))
        issue.refresh_from_db()
        assert issue.target_date == date(2026, 9, 10)

    @pytest.mark.django_db
    def test_rows_from_before_two_way_sync_are_skipped(self, connection, issue, google):
        synced = self._synced(connection, issue)
        synced.pushed_start = synced.pushed_end = None
        synced.save()
        google["list_changed"].return_value = ([_google_event(issue, date(2026, 9, 20), date(2026, 9, 20))], "s")
        sync.pull_calendar_changes(str(connection.id))
        issue.refresh_from_db()
        assert issue.target_date == date(2026, 9, 10)

    @pytest.mark.django_db
    def test_expired_sync_token_falls_back_to_full_listing(self, connection, issue, google):
        connection.sync_tokens = {"plane-cal": "old"}
        connection.save()
        google["list_changed"].side_effect = [gcal.SyncTokenExpired(), ([], "fresh")]
        sync.pull_calendar_changes(str(connection.id))
        connection.refresh_from_db()
        assert connection.sync_tokens == {"plane-cal": "fresh"}

    @pytest.mark.django_db
    def test_one_way_connections_are_not_pulled(self, connection, issue, google):
        connection.two_way_sync = False
        connection.save()
        sync.pull_calendar_changes(str(connection.id))
        google["list_changed"].assert_not_called()


@pytest.mark.contract
class TestWatchChannels:
    @pytest.mark.django_db
    def test_channel_is_opened_when_instance_is_https(self, connection, google, settings):
        settings.WEB_URL = "https://hub.example.com"
        sync.sync_user_calendar(str(connection.id))
        connection.refresh_from_db()
        assert len(connection.watch_channels) == 1
        channel = connection.watch_channels[0]
        assert channel["calendar_id"] == "plane-cal" and channel["resource_id"] == "r1" and channel["token"]

    @pytest.mark.django_db
    def test_no_channel_over_plain_http(self, connection, google, settings):
        settings.WEB_URL = "http://localhost:3000"
        sync.sync_user_calendar(str(connection.id))
        connection.refresh_from_db()
        assert connection.watch_channels == []

    @pytest.mark.django_db
    def test_notification_with_valid_token_triggers_pull(self, connection):
        connection.watch_channels = [{"id": "chan", "token": "secret", "calendar_id": "plane-cal"}]
        connection.save()
        client = APIClient()
        with (
            mock.patch("plane.app.views.user.google_calendar.pull_calendar_changes") as pull,
            mock.patch("plane.app.views.user.google_calendar.redis_instance") as redis,
        ):
            redis.return_value.set.return_value = True
            response = client.post(
                reverse("google-calendar-notifications"),
                HTTP_X_GOOG_CHANNEL_ID="chan",
                HTTP_X_GOOG_CHANNEL_TOKEN="secret",
                HTTP_X_GOOG_RESOURCE_STATE="exists",
            )
        assert response.status_code == 200
        pull.apply_async.assert_called_once()

    @pytest.mark.django_db
    def test_notification_with_wrong_token_is_rejected(self, connection):
        connection.watch_channels = [{"id": "chan", "token": "secret", "calendar_id": "plane-cal"}]
        connection.save()
        with mock.patch("plane.app.views.user.google_calendar.pull_calendar_changes") as pull:
            response = APIClient().post(
                reverse("google-calendar-notifications"),
                HTTP_X_GOOG_CHANNEL_ID="chan",
                HTTP_X_GOOG_CHANNEL_TOKEN="forged",
                HTTP_X_GOOG_RESOURCE_STATE="exists",
            )
        assert response.status_code == 404
        pull.apply_async.assert_not_called()


@pytest.mark.contract
class TestPreferencesAndEvents:
    @pytest.mark.django_db
    def test_preferences_validate_and_trigger_sync(self, session_client, connection, project):
        with mock.patch("plane.app.views.user.google_calendar.sync_user_calendar") as sync_task:
            response = session_client.patch(
                reverse("google-calendar-preferences"),
                {
                    "sync_project_ids": [str(project.id), "not-mine"],
                    "reminder_days_before": 2,
                    "calendar_per_project": True,
                },
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["sync_project_ids"] == [str(project.id)]
        assert response.data["reminder_days_before"] == 2
        sync_task.delay.assert_called_once()

    @pytest.mark.django_db
    def test_invalid_reminder_is_rejected(self, session_client, connection):
        response = session_client.patch(
            reverse("google-calendar-preferences"), {"reminder_days_before": 99}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_status_lists_projects(self, session_client, connection, project):
        with mock.patch(f"{GCAL}.list_calendars", return_value=[]):
            response = session_client.get(reverse("google-calendar-status"))
        assert response.data["two_way_sync"] is True
        assert [p["identifier"] for p in response.data["projects"]] == ["CAL"]

    @pytest.mark.django_db
    def test_events_are_linked_to_work_items_the_user_can_see(self, session_client, connection, issue, workspace):
        other_project = Project.objects.create(name="Secret", identifier="SEC", workspace=workspace)
        secret = Issue.objects.create(name="Secret", project=other_project, workspace=workspace)
        events = [
            {
                "id": gcal.issue_event_id(issue.id),
                "extendedProperties": {"private": {gcal.ISSUE_PROPERTY: str(issue.id)}},
            },
            {"id": "meet1", "extendedProperties": {"private": {gcal.ISSUE_PROPERTY: str(issue.id)}}},
            {"id": "x", "extendedProperties": {"private": {gcal.ISSUE_PROPERTY: str(secret.id)}}},
            {"id": "plain"},
        ]
        with mock.patch(f"{GCAL}.list_events", return_value=events):
            response = session_client.get(
                reverse("google-calendar-events"), {"after": "2026-09-01", "before": "2026-09-30"}
            )
        by_id = {e["id"]: e for e in response.data}
        assert by_id[gcal.issue_event_id(issue.id)]["plane_kind"] == "task"
        assert by_id["meet1"]["plane_kind"] == "meeting"
        assert by_id["meet1"]["plane_issue"]["project_identifier"] == "CAL"
        assert by_id["x"]["plane_issue"] is None
        assert by_id["plain"]["plane_kind"] is None


@pytest.mark.contract
class TestMeetings:
    def _url(self, workspace, project, issue, suffix=""):
        base = reverse(
            "project-issue-calendar-events",
            kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id},
        )
        return f"{base}{suffix}"

    @pytest.mark.django_db
    def test_schedule_meeting_with_meet_and_invites(self, session_client, workspace, project, issue, connection):
        created = {
            "id": "ev1",
            "summary": "Alinhamento",
            "start": {"dateTime": "2026-09-15T14:00:00-03:00"},
            "end": {"dateTime": "2026-09-15T15:00:00-03:00"},
            "htmlLink": "https://calendar.google.com/event?eid=1",
            "hangoutLink": "https://meet.google.com/abc-defg-hij",
            "attendees": [{"email": "ana@pespo.com", "responseStatus": "needsAction"}],
        }
        with (
            mock.patch(f"{GCAL}.create_event", return_value=created) as create_event,
            mock.patch("plane.app.views.issue.calendar_event.issue_activity"),
        ):
            response = session_client.post(
                self._url(workspace, project, issue),
                {
                    "summary": "Alinhamento",
                    "start": "2026-09-15T14:00:00-03:00",
                    "end": "2026-09-15T15:00:00-03:00",
                    "attendees": ["ana@pespo.com", "ANA@pespo.com"],
                    "with_meet": True,
                },
                format="json",
            )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["meet_link"] == "https://meet.google.com/abc-defg-hij"
        assert response.data["is_owner"] is True
        _, calendar_id, body = create_event.call_args.args
        assert calendar_id == "primary"
        assert create_event.call_args.kwargs == {"with_meet": True, "send_updates": "all"}
        assert body["attendees"] == [{"email": "ana@pespo.com"}]
        assert body["conferenceData"]["createRequest"]["conferenceSolutionKey"] == {"type": "hangoutsMeet"}
        assert body["extendedProperties"]["private"][gcal.ISSUE_PROPERTY] == str(issue.id)
        assert IssueCalendarEvent.objects.get(issue=issue).google_event_id == "ev1"

    @pytest.mark.django_db
    def test_schedule_rejects_bad_input(self, session_client, workspace, project, issue, connection):
        url = self._url(workspace, project, issue)
        bad_email = session_client.post(
            url,
            {"start": "2026-09-15T14:00:00-03:00", "end": "2026-09-15T15:00:00-03:00", "attendees": ["nope"]},
            format="json",
        )
        no_tz = session_client.post(url, {"start": "2026-09-15T14:00", "end": "2026-09-15T15:00"}, format="json")
        reversed_ = session_client.post(
            url, {"start": "2026-09-15T15:00:00Z", "end": "2026-09-15T14:00:00Z"}, format="json"
        )
        assert {bad_email.status_code, no_tz.status_code, reversed_.status_code} == {status.HTTP_400_BAD_REQUEST}

    @pytest.mark.django_db
    def test_schedule_requires_connection(self, session_client, workspace, project, issue):
        response = session_client.post(
            self._url(workspace, project, issue),
            {"start": "2026-09-15T14:00:00Z", "end": "2026-09-15T15:00:00Z"},
            format="json",
        )
        assert response.data["code"] == "GOOGLE_CALENDAR_NOT_CONNECTED"

    @pytest.mark.django_db
    def test_link_existing_event_tags_it(self, session_client, workspace, project, issue, connection):
        event = {
            "id": "ev9",
            "summary": "Reunião cliente",
            "start": {"date": "2026-09-20"},
            "end": {"date": "2026-09-21"},
        }
        with (
            mock.patch(f"{GCAL}.get_event", return_value=event),
            mock.patch(f"{GCAL}.patch_event", return_value=event) as patch_event,
            mock.patch("plane.app.views.issue.calendar_event.issue_activity"),
        ):
            response = session_client.post(
                self._url(workspace, project, issue, "link/"),
                {"google_event_id": "ev9", "calendar_id": "primary"},
                format="json",
            )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["all_day"] is True
        assert patch_event.call_args.args[3]["extendedProperties"]["private"][gcal.ISSUE_PROPERTY] == str(issue.id)

    @pytest.mark.django_db
    def test_cancel_meeting_notifies_attendees(self, session_client, workspace, project, issue, connection):
        row = IssueCalendarEvent.objects.create(
            issue=issue,
            project=project,
            workspace=workspace,
            google_event_id="ev1",
            calendar_id="primary",
        )
        # BaseModel.save() overwrites created_by with the request user (none here).
        IssueCalendarEvent.objects.filter(pk=row.pk).update(created_by=connection.user)
        url = reverse(
            "project-issue-calendar-event-detail",
            kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id, "pk": row.id},
        )
        with (
            mock.patch(f"{GCAL}.delete_event") as delete_event,
            mock.patch("plane.app.views.issue.calendar_event.issue_activity"),
        ):
            response = session_client.delete(f"{url}?cancel=true")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        delete_event.assert_called_once_with("access", "primary", "ev1", send_updates="all")
        assert not IssueCalendarEvent.objects.filter(pk=row.pk).exists()

    @pytest.mark.django_db
    def test_list_refreshes_own_meetings_and_drops_cancelled(
        self, session_client, workspace, project, issue, connection
    ):
        row = IssueCalendarEvent.objects.create(
            issue=issue,
            project=project,
            workspace=workspace,
            google_event_id="ev1",
            calendar_id="primary",
        )
        # BaseModel.save() overwrites created_by with the request user (none here).
        IssueCalendarEvent.objects.filter(pk=row.pk).update(created_by=connection.user)
        IssueCalendarEvent.objects.filter(pk=row.pk).update(updated_at=timezone.now() - timedelta(hours=1))
        with mock.patch(f"{GCAL}.get_event", return_value={"id": "ev1", "status": "cancelled"}):
            response = session_client.get(self._url(workspace, project, issue))
        assert response.data == []

    @pytest.mark.django_db
    def test_guest_cannot_schedule(self, workspace, project, issue):
        guest = User.objects.create(email="guest-cal@plane.so", username="guest_cal")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(project=project, member=guest, role=5, is_active=True)
        client = APIClient()
        client.force_authenticate(user=guest)
        response = client.post(
            self._url(workspace, project, issue),
            {"start": "2026-09-15T14:00:00Z", "end": "2026-09-15T15:00:00Z"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
