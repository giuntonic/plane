# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import date
from unittest import mock

import pytest

from plane.utils import google_calendar as gcal


@pytest.mark.unit
class TestIssueDateRange:
    def test_due_date_only(self):
        assert gcal.issue_date_range(None, date(2026, 9, 10)) == (date(2026, 9, 10), date(2026, 9, 10))

    def test_start_to_due(self):
        assert gcal.issue_date_range(date(2026, 9, 8), date(2026, 9, 10)) == (date(2026, 9, 8), date(2026, 9, 10))

    def test_start_after_due_is_ignored(self):
        assert gcal.issue_date_range(date(2026, 9, 12), date(2026, 9, 10)) == (date(2026, 9, 10), date(2026, 9, 10))


@pytest.mark.unit
class TestBuildIssueEventBody:
    def _body(self, **overrides):
        kwargs = dict(
            issue_id="i-1",
            name="Revisar arte",
            start_date=date(2026, 9, 8),
            target_date=date(2026, 9, 10),
            priority="urgent",
            url="https://hub/x/",
            color_by_priority=True,
            reminder_days_before=None,
        )
        kwargs.update(overrides)
        return gcal.build_issue_event_body(**kwargs)

    def test_multi_day_all_day_event_with_exclusive_end(self):
        body = self._body()
        assert body["start"] == {"date": "2026-09-08"}
        assert body["end"] == {"date": "2026-09-11"}
        assert body["transparency"] == "transparent"
        assert body["status"] == "confirmed"
        assert body["extendedProperties"]["private"][gcal.ISSUE_PROPERTY] == "i-1"

    def test_color_by_priority(self):
        assert self._body()["colorId"] == "11"
        assert self._body(priority="none")["colorId"] is None
        assert self._body(color_by_priority=False)["colorId"] is None

    @pytest.mark.parametrize(
        "days,expected",
        [
            (None, {"useDefault": True}),
            (-1, {"useDefault": False, "overrides": []}),
            (1, {"useDefault": False, "overrides": [{"method": "popup", "minutes": 900}]}),
            (2, {"useDefault": False, "overrides": [{"method": "popup", "minutes": 2340}]}),
        ],
    )
    def test_reminders(self, days, expected):
        assert self._body(reminder_days_before=days)["reminders"] == expected


@pytest.mark.unit
class TestEventDateRange:
    def test_all_day_end_is_exclusive(self):
        event = {"start": {"date": "2026-09-08"}, "end": {"date": "2026-09-11"}}
        assert gcal.event_date_range(event) == (date(2026, 9, 8), date(2026, 9, 10))

    def test_timed_event_counts_by_date(self):
        event = {
            "start": {"dateTime": "2026-09-08T14:00:00-03:00"},
            "end": {"dateTime": "2026-09-08T15:00:00-03:00"},
        }
        assert gcal.event_date_range(event) == (date(2026, 9, 8), date(2026, 9, 8))

    def test_missing_end(self):
        assert gcal.event_date_range({"start": {"date": "2026-09-08"}}) == (date(2026, 9, 8), date(2026, 9, 8))

    def test_dates_from_range_keeps_no_start_date_for_single_day(self):
        d = date(2026, 9, 9)
        assert gcal.dates_from_event_range(d, d, had_start_date=False) == (None, d)
        assert gcal.dates_from_event_range(d, d, had_start_date=True) == (d, d)
        assert gcal.dates_from_event_range(date(2026, 9, 8), d, had_start_date=False) == (date(2026, 9, 8), d)


@pytest.mark.unit
class TestHttpHelpers:
    def test_calendar_ids_are_percent_encoded(self):
        url = gcal._event_url("en.brazilian#holiday@group.v.calendar.google.com", "ev1")
        assert "en.brazilian%23holiday%40group.v.calendar.google.com/events/ev1" in url

    def test_list_changed_events_paginates_and_returns_sync_token(self):
        pages = [
            mock.Mock(status_code=200, json=lambda: {"items": [{"id": "a"}], "nextPageToken": "p2"}),
            mock.Mock(status_code=200, json=lambda: {"items": [{"id": "b"}], "nextSyncToken": "s2"}),
        ]
        with mock.patch.object(gcal.requests, "get", side_effect=pages) as get:
            items, token = gcal.list_changed_events("tok", "cal", "s1")
        assert [i["id"] for i in items] == ["a", "b"]
        assert token == "s2"
        assert get.call_args_list[0].kwargs["params"]["syncToken"] == "s1"
        assert get.call_args_list[1].kwargs["params"]["pageToken"] == "p2"

    def test_list_changed_events_raises_on_expired_token(self):
        with mock.patch.object(gcal.requests, "get", return_value=mock.Mock(status_code=410)):
            with pytest.raises(gcal.SyncTokenExpired):
                gcal.list_changed_events("tok", "cal", "old")
