# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests (Pespo): dates of recurring work items."""

from datetime import date

import pytest

from plane.utils.recurrence import is_occurrence, next_occurrence, validate_rule


def _rule(frequency, anchor, interval=1, weekdays=None, end=None):
    return {
        "frequency": frequency,
        "interval": interval,
        "weekdays": weekdays or [],
        "anchor_date": anchor,
        "end_date": end,
    }


@pytest.mark.unit
class TestNextOccurrence:
    def test_daily_every_two_days(self):
        rule = _rule("daily", date(2026, 10, 1), interval=2)
        assert next_occurrence(rule, date(2026, 10, 1)) == date(2026, 10, 3)
        assert next_occurrence(rule, date(2026, 10, 2)) == date(2026, 10, 3)
        assert next_occurrence(rule, date(2026, 9, 1)) == date(2026, 10, 1)  # nunca antes da âncora

    def test_weekly_on_chosen_weekdays(self):
        # âncora numa quinta (22/10/2026); segundas e quartas
        rule = _rule("weekly", date(2026, 10, 22), weekdays=[0, 2])
        assert next_occurrence(rule, date(2026, 10, 22)) == date(2026, 10, 26)  # segunda
        assert next_occurrence(rule, date(2026, 10, 26)) == date(2026, 10, 28)  # quarta

    def test_weekly_every_other_week_defaults_to_anchor_weekday(self):
        rule = _rule("weekly", date(2026, 10, 22), interval=2)
        assert next_occurrence(rule, date(2026, 10, 22)) == date(2026, 11, 5)
        assert not is_occurrence(rule, date(2026, 10, 29))

    def test_monthly_on_day_31_clamps_to_month_end(self):
        rule = _rule("monthly", date(2026, 1, 31))
        assert next_occurrence(rule, date(2026, 1, 31)) == date(2026, 2, 28)
        assert next_occurrence(rule, date(2026, 2, 28)) == date(2026, 3, 31)
        assert next_occurrence(rule, date(2026, 4, 1)) == date(2026, 4, 30)

    def test_monthly_every_three_months(self):
        rule = _rule("monthly", date(2026, 10, 15), interval=3)
        assert next_occurrence(rule, date(2026, 10, 15)) == date(2027, 1, 15)
        assert next_occurrence(rule, date(2026, 12, 31)) == date(2027, 1, 15)

    def test_yearly_on_leap_day(self):
        rule = _rule("yearly", date(2028, 2, 29))
        assert next_occurrence(rule, date(2028, 2, 29)) == date(2029, 2, 28)
        assert next_occurrence(rule, date(2031, 3, 1)) == date(2032, 2, 29)

    def test_end_date_stops_the_series(self):
        rule = _rule("daily", date(2026, 10, 1), end=date(2026, 10, 3))
        assert next_occurrence(rule, date(2026, 10, 2)) == date(2026, 10, 3)
        assert next_occurrence(rule, date(2026, 10, 3)) is None


@pytest.mark.unit
class TestValidateRule:
    def test_normalizes(self):
        rule, error = validate_rule({"frequency": "weekly", "interval": "2", "weekdays": [4, 0, 4]})
        assert error is None and rule == {"frequency": "weekly", "interval": 2, "weekdays": [0, 4]}
        rule, _ = validate_rule({"frequency": "daily", "weekdays": [1]})
        assert rule["weekdays"] == []

    @pytest.mark.parametrize(
        "data,code",
        [
            ({"frequency": "hourly"}, "INVALID_FREQUENCY"),
            ({"frequency": "daily", "interval": 0}, "INVALID_INTERVAL"),
            ({"frequency": "daily", "interval": "x"}, "INVALID_INTERVAL"),
            ({"frequency": "weekly", "weekdays": [7]}, "INVALID_WEEKDAYS"),
        ],
    )
    def test_errors(self, data, code):
        assert validate_rule(data) == (None, code)
