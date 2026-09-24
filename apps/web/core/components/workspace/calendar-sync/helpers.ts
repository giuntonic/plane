/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TBaseIssue, TGoogleCalendarEvent } from "@plane/types";

// Pespo: aritmética de datas do calendário. Tudo em "YYYY-MM-DD" e em UTC,
// pra horário de verão nunca pular ou repetir um dia.

const toUtc = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

export const addDays = (dateKey: string, days: number): string =>
  new Date(toUtc(dateKey) + days * 86_400_000).toISOString().slice(0, 10);

export const diffDays = (from: string, to: string): number => Math.round((toUtc(to) - toUtc(from)) / 86_400_000);

/** First and last day a work item occupies: start -> due, or just the due date. */
export const issueRange = (issue: Pick<TBaseIssue, "start_date" | "target_date">): [string, string] | null => {
  if (!issue.target_date) return null;
  const start = issue.start_date && issue.start_date <= issue.target_date ? issue.start_date : issue.target_date;
  return [start, issue.target_date];
};

/** First and last day (inclusive) of a Google event. */
export const eventRange = (event: TGoogleCalendarEvent): [string, string] | null => {
  const start = event.start?.date ?? event.start?.dateTime?.slice(0, 10);
  if (!start) return null;
  let end = start;
  if (event.end?.date)
    end = addDays(event.end.date, -1); // all-day end is exclusive
  else if (event.end?.dateTime) end = event.end.dateTime.slice(0, 10);
  return [start, end < start ? start : end];
};

export const eachDay = (range: [string, string], clampStart: string, clampEnd: string): string[] => {
  const first = range[0] < clampStart ? clampStart : range[0];
  const last = range[1] > clampEnd ? clampEnd : range[1];
  const days: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
};

export const meetLink = (event: TGoogleCalendarEvent) =>
  event.hangoutLink ?? event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;

export const formatEventTime = (event: TGoogleCalendarEvent, allDayLabel: string) => {
  if (event.start?.date) return allDayLabel;
  if (!event.start?.dateTime) return "";
  const timeOptions: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  const start = new Date(event.start.dateTime).toLocaleTimeString(undefined, timeOptions);
  const end = event.end?.dateTime ? new Date(event.end.dateTime).toLocaleTimeString(undefined, timeOptions) : undefined;
  return end ? `${start} – ${end}` : start;
};

/** Plain text of an event description (Google sends HTML for some events). */
export const eventDescriptionText = (description?: string) =>
  (description ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

export const DRAG_MIME = "application/x-plane-issue";
