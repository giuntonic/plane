/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: widget "Agenda" da home — eventos do Google Calendar dos próximos dias, agrupados por dia
// no fuso do navegador.
import type { TGoogleCalendarEvent } from "@plane/types";

export type TAgendaEntry = {
  event: TGoogleCalendarEvent;
  allDay: boolean;
  start: Date | null;
  end: Date | null;
  /** Google Meet (or another video call attached to the event). */
  meetingLink?: string;
  isNow: boolean;
  isPast: boolean;
};

export type TAgendaDay = {
  /** Local date, "YYYY-MM-DD". */
  dateKey: string;
  entries: TAgendaEntry[];
};

const pad = (value: number) => String(value).padStart(2, "0");

/** Local calendar date of a moment, "YYYY-MM-DD". */
export const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const fromDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/** Day arithmetic on local dates (a DST change never skips or repeats a day). */
export const addDaysToDateKey = (dateKey: string, days: number) => {
  const date = fromDateKey(dateKey);
  return toLocalDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
};

/** `after`/`before` for the events API: from the start of today to the start of the day after the range. */
export const getAgendaRange = (now: Date, days: number) => {
  const today = toLocalDateKey(now);
  return {
    after: fromDateKey(today).toISOString(),
    before: fromDateKey(addDaysToDateKey(today, days)).toISOString(),
  };
};

export const getEventMeetingLink = (event: TGoogleCalendarEvent) =>
  event.hangoutLink ?? event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri;

const isDeclinedByMe = (event: TGoogleCalendarEvent) =>
  event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined") ?? false;

/** First and last local day (inclusive) an event occupies. */
const getEventDays = (event: TGoogleCalendarEvent, start: Date | null, end: Date | null): [string, string] | null => {
  if (event.start?.date) {
    const first = event.start.date;
    // the end of an all-day event is exclusive
    const last = event.end?.date ? addDaysToDateKey(event.end.date, -1) : first;
    return [first, last < first ? first : last];
  }
  if (!start) return null;
  const first = toLocalDateKey(start);
  // an event ending exactly at midnight doesn't take the next day
  const last = end && end > start ? toLocalDateKey(new Date(end.getTime() - 1)) : first;
  return [first, last < first ? first : last];
};

/**
 * Days from today on (`days` of them, empty ones included) with the events of each: all-day first,
 * then by start time. Cancelled events and the ones I declined are left out.
 */
export const buildAgenda = (events: TGoogleCalendarEvent[], now: Date, days: number): TAgendaDay[] => {
  const today = toLocalDateKey(now);
  const agenda: TAgendaDay[] = Array.from({ length: Math.max(1, days) }, (_, index) => ({
    dateKey: addDaysToDateKey(today, index),
    entries: [],
  }));
  const lastDay = agenda[agenda.length - 1].dateKey;
  const seen = new Set<string>();

  for (const event of events) {
    if (event.status === "cancelled" || isDeclinedByMe(event)) continue;
    // the same event can come from two calendars (e.g. a shared one)
    const identity = `${event.id}|${event.start?.dateTime ?? event.start?.date ?? ""}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    const allDay = !!event.start?.date;
    const start = event.start?.dateTime ? new Date(event.start.dateTime) : null;
    const end = event.end?.dateTime ? new Date(event.end.dateTime) : null;
    const range = getEventDays(event, start, end);
    if (!range || range[1] < today || range[0] > lastDay) continue;

    const entry: TAgendaEntry = {
      event,
      allDay,
      start,
      end,
      meetingLink: getEventMeetingLink(event),
      isNow: !allDay && !!start && !!end && start <= now && now < end,
      isPast: !allDay && !!end && end <= now,
    };
    for (const day of agenda) {
      if (day.dateKey >= range[0] && day.dateKey <= range[1]) day.entries.push(entry);
    }
  }

  for (const day of agenda) {
    day.entries.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0);
    });
  }
  return agenda;
};
