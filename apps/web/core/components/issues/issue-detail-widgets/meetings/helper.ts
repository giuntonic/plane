/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// plane imports
import type { TGoogleCalendarErrorCode } from "@plane/types";
// services
import { issueCalendarEventService } from "@/services/issue-calendar-event.service";

export const getIssueMeetingsKey = (issueId: string) => `ISSUE_CALENDAR_EVENTS_${issueId}`;

/** Meetings linked to a work item. Shared SWR key between the button, the list and the modal. */
export const useIssueMeetings = (workspaceSlug: string, projectId: string, issueId: string) =>
  useSWR(workspaceSlug && projectId && issueId ? getIssueMeetingsKey(issueId) : null, () =>
    issueCalendarEventService.list(workspaceSlug, projectId, issueId)
  );

const ERROR_KEYS: Partial<Record<TGoogleCalendarErrorCode, string>> = {
  GOOGLE_CALENDAR_NOT_CONNECTED: "google_calendar_integration.errors.not_connected",
  GOOGLE_CALENDAR_FORBIDDEN: "google_calendar_integration.errors.forbidden",
  GOOGLE_CALENDAR_NOT_FOUND: "google_calendar_integration.errors.not_found",
};

/** i18n key for a failed Calendar request (services throw the response body). */
export const getGoogleCalendarErrorKey = (error: unknown): string =>
  ERROR_KEYS[(error as { code?: TGoogleCalendarErrorCode } | undefined)?.code ?? "GOOGLE_CALENDAR_ERROR"] ??
  "google_calendar_integration.errors.generic";
