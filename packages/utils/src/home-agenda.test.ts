/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import type { TGoogleCalendarEvent } from "@plane/types";
import { addDaysToDateKey, buildAgenda, getAgendaRange, getEventMeetingLink, toLocalDateKey } from "./home-agenda";

// Dates are built in local time, like the browser does, so the test passes in any time zone.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);
const timed = (
  id: string,
  start: Date,
  end: Date,
  extra: Partial<TGoogleCalendarEvent> = {}
): TGoogleCalendarEvent => ({
  id,
  summary: id,
  start: { dateTime: start.toISOString() },
  end: { dateTime: end.toISOString() },
  ...extra,
});
const allDay = (id: string, start: string, endExclusive: string): TGoogleCalendarEvent => ({
  id,
  summary: id,
  start: { date: start },
  end: { date: endExclusive },
});

const now = at(23, 10, 30); // Friday 23/10/2026, 10:30

describe("date keys", () => {
  it("formats and moves local dates", () => {
    expect(toLocalDateKey(now)).toBe("2026-10-23");
    expect(addDaysToDateKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToDateKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("asks the API from the start of today to the start of the day after the range", () => {
    const range = getAgendaRange(now, 7);
    expect(new Date(range.after).getTime()).toBe(at(23, 0).getTime());
    expect(new Date(range.before).getTime()).toBe(at(30, 0).getTime());
  });
});

describe("buildAgenda", () => {
  it("lists every day of the range, including empty ones", () => {
    const agenda = buildAgenda([], now, 3);
    expect(agenda.map((day) => day.dateKey)).toEqual(["2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(agenda.every((day) => day.entries.length === 0)).toBe(true);
  });

  it("puts all-day events first, then orders by start time", () => {
    const agenda = buildAgenda(
      [
        timed("afternoon", at(23, 15), at(23, 16)),
        allDay("holiday", "2026-10-23", "2026-10-24"),
        timed("morning", at(23, 9), at(23, 9, 30)),
      ],
      now,
      1
    );
    expect(agenda[0].entries.map((entry) => entry.event.id)).toEqual(["holiday", "morning", "afternoon"]);
  });

  it("marks what is happening now and what already ended", () => {
    const [today] = buildAgenda(
      [
        timed("past", at(23, 8), at(23, 9)),
        timed("now", at(23, 10), at(23, 11)),
        timed("later", at(23, 14), at(23, 15)),
      ],
      now,
      1
    );
    const byId = Object.fromEntries(today.entries.map((entry) => [entry.event.id, entry]));
    expect(byId.past.isPast).toBe(true);
    expect(byId.now.isNow).toBe(true);
    expect(byId.later.isNow || byId.later.isPast).toBe(false);
  });

  it("shows a multi-day all-day event on each of its days (end date is exclusive)", () => {
    const agenda = buildAgenda([allDay("trip", "2026-10-24", "2026-10-26")], now, 4);
    expect(agenda.map((day) => day.entries.length)).toEqual([0, 1, 1, 0]);
  });

  it("does not put an event that ends at midnight on the next day", () => {
    const agenda = buildAgenda([timed("late", at(23, 22), at(24, 0))], now, 2);
    expect(agenda.map((day) => day.entries.length)).toEqual([1, 0]);
  });

  it("leaves out cancelled events, declined ones and events outside the range", () => {
    const agenda = buildAgenda(
      [
        timed("cancelled", at(23, 14), at(23, 15), { status: "cancelled" }),
        timed("declined", at(23, 14), at(23, 15), {
          attendees: [{ email: "me@pespo.com.br", self: true, responseStatus: "declined" }],
        }),
        timed("yesterday", at(22, 14), at(22, 15)),
        timed("next-month", at(30, 14), at(30, 15)),
      ],
      now,
      3
    );
    expect(agenda.flatMap((day) => day.entries)).toHaveLength(0);
  });

  it("shows an event that comes from two calendars only once", () => {
    const meeting = timed("meeting", at(23, 14), at(23, 15));
    const [today] = buildAgenda([meeting, { ...meeting }], now, 1);
    expect(today.entries).toHaveLength(1);
  });
});

describe("getEventMeetingLink", () => {
  it("uses the Meet link, or the video entry point of another conference", () => {
    expect(getEventMeetingLink({ id: "a", hangoutLink: "https://meet.google.com/abc" })).toBe(
      "https://meet.google.com/abc"
    );
    expect(
      getEventMeetingLink({
        id: "b",
        conferenceData: {
          entryPoints: [
            { entryPointType: "phone", uri: "tel:+55" },
            { entryPointType: "video", uri: "https://zoom.us/j/1" },
          ],
        },
      })
    ).toBe("https://zoom.us/j/1");
    expect(getEventMeetingLink({ id: "c" })).toBeUndefined();
  });
});
