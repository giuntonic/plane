/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TGoogleCalendarListEntry = {
  id: string;
  summary: string;
  primary: boolean;
  background_color?: string | null;
  access_role?: "owner" | "writer" | "reader" | "freeBusyReader" | null;
};

export type TGoogleCalendarProject = {
  id: string;
  name: string;
  identifier: string;
  workspace_slug: string;
  workspace_name: string;
};

export type TGoogleCalendarPreferences = {
  sync_enabled: boolean;
  /** Google -> Plane: moving/renaming the event in Google updates the work item. */
  two_way_sync: boolean;
  calendar_per_project: boolean;
  color_by_priority: boolean;
  /** null: calendar default; -1: none; N: N days before, at 9:00. */
  reminder_days_before: number | null;
  /** Empty: every project. */
  sync_project_ids: string[];
  overlay_calendar_ids: string[];
};

export type TGoogleCalendarStatus =
  | { connected: false }
  | ({
      connected: true;
      google_email: string;
      plane_calendar_id: string;
      project_calendar_ids: Record<string, string>;
      last_synced_at: string | null;
      /** Google push notifications are active (changes arrive in seconds). */
      realtime_enabled: boolean;
      calendars: TGoogleCalendarListEntry[];
      projects: TGoogleCalendarProject[];
    } & TGoogleCalendarPreferences);

export type TGoogleCalendarEventTime = { date?: string; dateTime?: string; timeZone?: string };

export type TGoogleCalendarAttendee = {
  email: string;
  displayName?: string;
  responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
  organizer?: boolean;
  self?: boolean;
};

/** Work item a Google event is linked to (added by the Plane API). */
export type TGoogleCalendarLinkedIssue = {
  id: string;
  name: string;
  sequence_id: number;
  project_id: string;
  project_identifier: string;
  workspace_slug: string;
  is_completed: boolean;
};

export type TGoogleCalendarEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  colorId?: string;
  start?: TGoogleCalendarEventTime;
  end?: TGoogleCalendarEventTime;
  attendees?: TGoogleCalendarAttendee[];
  organizer?: { email?: string; displayName?: string; self?: boolean };
  conferenceData?: { entryPoints?: { entryPointType: string; uri: string; label?: string }[] };
  /** Calendar the event was read from (added by the Plane API). */
  calendar_id?: string;
  plane_issue?: TGoogleCalendarLinkedIssue | null;
  /** "task": the work item's own due-date event; "meeting": a meeting linked to it. */
  plane_kind?: "task" | "meeting" | null;
};

/** A Google Calendar event (meeting) linked to a work item. */
export type TIssueCalendarEvent = {
  id: string;
  issue: string;
  google_event_id: string;
  calendar_id: string;
  summary: string;
  start: string | null;
  end: string | null;
  all_day: boolean;
  html_link: string;
  meet_link: string;
  attendees: {
    email: string;
    display_name: string | null;
    response_status: TGoogleCalendarAttendee["responseStatus"] | null;
    organizer: boolean;
  }[];
  created_by: string | null;
  is_owner: boolean;
};

export type TIssueCalendarEventCreatePayload = {
  summary: string;
  description?: string;
  /** ISO datetime with offset, or YYYY-MM-DD when all_day. */
  start: string;
  end: string;
  all_day?: boolean;
  attendees: string[];
  with_meet: boolean;
  calendar_id?: string;
};

export type TGoogleCalendarErrorCode =
  | "GOOGLE_CALENDAR_NOT_CONNECTED"
  | "GOOGLE_CALENDAR_FORBIDDEN"
  | "GOOGLE_CALENDAR_NOT_FOUND"
  | "GOOGLE_CALENDAR_ERROR";
