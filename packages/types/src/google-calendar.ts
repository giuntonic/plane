/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TGoogleCalendarListEntry = {
  id: string;
  summary: string;
  primary: boolean;
};

export type TGoogleCalendarStatus =
  | { connected: false }
  | {
      connected: true;
      google_email: string;
      sync_enabled: boolean;
      plane_calendar_id: string;
      overlay_calendar_ids: string[];
      last_synced_at: string | null;
      calendars: TGoogleCalendarListEntry[];
    };

export type TGoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};
