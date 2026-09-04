/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { EStartOfTheWeek } from "@plane/types";
import type { TBaseIssue, TGoogleCalendarEvent } from "@plane/types";
import { Spinner } from "@plane/ui";
import { generateCalendarData, renderFormattedPayloadDate } from "@plane/utils";
// services
import { WorkspaceService } from "@/services/workspace.service";
import userService from "@/services/user.service";
// local imports
import { CalendarSyncDayCell } from "./day-cell";
import { CalendarSyncHeader } from "./header";

const workspaceService = new WorkspaceService();

const WEEK_DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export type TDayEntry = {
  issues: TBaseIssue[];
  events: TGoogleCalendarEvent[];
};

export const WorkspaceCalendarSyncRoot = observer(function WorkspaceCalendarSyncRoot() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const [activeMonthDate, setActiveMonthDate] = useState(new Date());

  const calendarPayload = useMemo(
    () => generateCalendarData(null, activeMonthDate, EStartOfTheWeek.SUNDAY),
    [activeMonthDate]
  );

  const year = activeMonthDate.getFullYear();
  const month = activeMonthDate.getMonth();
  const weeks = calendarPayload[`y-${year}`]?.[`m-${month}`] ?? {};
  const weekEntries = Object.values(weeks);

  const monthStart = weekEntries[0] ? Object.values(weekEntries[0])[0]?.date : undefined;
  const lastWeek = weekEntries[weekEntries.length - 1];
  const monthEnd = lastWeek ? Object.values(lastWeek)[6]?.date : undefined;
  const after = monthStart ? renderFormattedPayloadDate(monthStart) : undefined;
  const before = monthEnd ? renderFormattedPayloadDate(monthEnd) : undefined;

  const { data: issuesResponse } = useSWR(slug ? ["workspace-calendar-issues", slug] : null, () =>
    workspaceService.getViewIssues(slug, { per_page: 100 })
  );
  const issues = useMemo(
    () => (Array.isArray(issuesResponse?.results) ? issuesResponse.results : []) as TBaseIssue[],
    [issuesResponse]
  );

  const { data: status } = useSWR("google-calendar-status", () => userService.googleCalendarStatus());

  const { data: events } = useSWR(
    status?.connected && after && before ? ["google-calendar-events", after, before] : null,
    () => userService.googleCalendarEvents(after as string, before as string)
  );

  const entriesByDate = useMemo(() => {
    const map = new Map<string, TDayEntry>();

    const getEntry = (dateKey: string) => {
      let entry = map.get(dateKey);
      if (!entry) {
        entry = { issues: [], events: [] };
        map.set(dateKey, entry);
      }
      return entry;
    };

    // Issues already show up as their own chip — an event on the overlay
    // calendar with a matching id is that same synced issue, not extra
    // information, so it must not be rendered a second time.
    const syncedEventIds = new Set(issues.map((issue) => issue.id.replace(/-/g, "")));

    for (const issue of issues) {
      if (!issue.target_date) continue;
      getEntry(issue.target_date).issues.push(issue);
    }

    for (const event of events ?? []) {
      if (syncedEventIds.has(event.id)) continue;
      const dateKey = event.start?.date ?? event.start?.dateTime?.slice(0, 10);
      if (!dateKey) continue;
      getEntry(dateKey).events.push(event);
    }

    return map;
  }, [issues, events]);

  const isLoading = !issuesResponse;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <CalendarSyncHeader
        activeMonthDate={activeMonthDate}
        setActiveMonthDate={setActiveMonthDate}
        isGoogleConnected={!!status?.connected}
      />
      {isLoading ? (
        <div className="grid h-full w-full place-items-center">
          <Spinner />
        </div>
      ) : (
        <div className="flex h-full w-full flex-col overflow-y-auto">
          <div className="grid grid-cols-7 divide-x-[0.5px] divide-subtle-1 border-b border-subtle-1">
            {WEEK_DAY_LABELS.map((label) => (
              <div key={label} className="px-2 py-1.5 text-center text-caption-sm-medium text-tertiary">
                {label}
              </div>
            ))}
          </div>
          <div className="grid h-full w-full grid-cols-1 divide-y-[0.5px] divide-subtle-1">
            {weekEntries.map((week) => {
              const weekStartDate = Object.values(week)[0]?.date;
              const weekKey = weekStartDate ? renderFormattedPayloadDate(weekStartDate) : "";
              return (
                <div key={weekKey} className="grid grid-cols-7 divide-x-[0.5px] divide-subtle-1">
                  {Object.entries(week).map(([dateKey, calendarDate]) => (
                    <CalendarSyncDayCell
                      key={dateKey}
                      dateKey={dateKey}
                      calendarDate={calendarDate}
                      entry={entriesByDate.get(dateKey)}
                      workspaceSlug={slug}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
