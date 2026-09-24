/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EStartOfTheWeek } from "@plane/types";
import type { TBaseIssue, TGoogleCalendarEvent, TIssue, TIssuesResponse } from "@plane/types";
import { Spinner } from "@plane/ui";
import { generateCalendarData, renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
// components
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
// hooks
import { useUser, useUserPermissions } from "@/hooks/store/user";
// services
import { IssueService } from "@/services/issue";
import { issueCalendarEventService } from "@/services/issue-calendar-event.service";
import { WorkspaceService } from "@/services/workspace.service";
import userService from "@/services/user.service";
// local imports
import type { TDragPayload } from "./day-cell";
import { CalendarSyncDayCell } from "./day-cell";
import { CalendarSyncHeader } from "./header";
import { addDays, diffDays, eachDay, eventDescriptionText, eventRange, issueRange } from "./helpers";

const workspaceService = new WorkspaceService();
const issueService = new IssueService();

const WEEK_DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const PAGE_SIZE = 500;
const MAX_PAGES = 10;

export type TDayEntry = {
  issues: { issue: TBaseIssue; isContinuation: boolean }[];
  events: { event: TGoogleCalendarEvent; isContinuation: boolean }[];
};

/** Every work item due in [after, before], across all pages. */
const fetchIssuesInRange = async (slug: string, after: string, before: string, assigneeId?: string) => {
  const issues: TBaseIssue[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    // Sequential on purpose: each page needs the previous page's cursor.
    // oxlint-disable-next-line no-await-in-loop
    const response: TIssuesResponse = await workspaceService.getViewIssues(slug, {
      per_page: PAGE_SIZE,
      cursor,
      order_by: "target_date",
      target_date: `${after};after,${before};before`,
      ...(assigneeId ? { assignees: assigneeId } : {}),
    });
    if (Array.isArray(response?.results)) issues.push(...(response.results as TBaseIssue[]));
    if (!response?.next_page_results) break;
    cursor = response.next_cursor;
  }
  return issues;
};

export const WorkspaceCalendarSyncRoot = observer(function WorkspaceCalendarSyncRoot() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const [activeMonthDate, setActiveMonthDate] = useState(new Date());
  const [onlyMine, setOnlyMine] = useState(false);
  const [showGoogleEvents, setShowGoogleEvents] = useState(true);
  const [eventToConvert, setEventToConvert] = useState<TGoogleCalendarEvent | null>(null);

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
  // Multi-day work items that start in this view but are due later still
  // need to show up: look ahead a month for due dates.
  const issuesBefore = before ? addDays(before, 31) : undefined;

  const issuesKey =
    slug && after && issuesBefore
      ? ["workspace-calendar-issues", slug, after, issuesBefore, onlyMine ? currentUser?.id : "all"]
      : null;
  const {
    data: issues,
    mutate: mutateIssues,
    isLoading,
  } = useSWR(issuesKey, () =>
    fetchIssuesInRange(slug, after as string, issuesBefore as string, onlyMine ? currentUser?.id : undefined)
  );

  const { data: status } = useSWR("google-calendar-status", () => userService.googleCalendarStatus());

  const { data: events, mutate: mutateEvents } = useSWR(
    status?.connected && showGoogleEvents && after && before ? ["google-calendar-events", after, before] : null,
    () => userService.googleCalendarEvents(after as string, before as string)
  );

  const entriesByDate = useMemo(() => {
    const map = new Map<string, TDayEntry>();
    if (!after || !before) return map;

    const getEntry = (dateKey: string) => {
      let entry = map.get(dateKey);
      if (!entry) {
        entry = { issues: [], events: [] };
        map.set(dateKey, entry);
      }
      return entry;
    };

    const issueIds = new Set((issues ?? []).map((issue) => issue.id));

    for (const issue of issues ?? []) {
      const range = issueRange(issue);
      if (!range) continue;
      for (const day of eachDay(range, after, before)) {
        getEntry(day).issues.push({ issue, isContinuation: day !== range[0] && day !== after });
      }
    }

    for (const event of events ?? []) {
      // A work item's own due-date event duplicates its chip.
      if (event.plane_kind === "task" && event.plane_issue && issueIds.has(event.plane_issue.id)) continue;
      const range = eventRange(event);
      if (!range) continue;
      for (const day of eachDay(range, after, before)) {
        getEntry(day).events.push({ event, isContinuation: day !== range[0] && day !== after });
      }
    }

    return map;
  }, [issues, events, after, before]);

  const canDrag = useCallback(
    (issue: TBaseIssue) =>
      !!issue.project_id &&
      allowPermissions(
        [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        EUserPermissionsLevel.PROJECT,
        slug,
        issue.project_id
      ),
    [allowPermissions, slug]
  );

  /** Moves the whole work item (start and due date) by the number of days it was dragged. */
  const handleDropIssue = async (payload: TDragPayload, toDay: string) => {
    const issue = issues?.find((i) => i.id === payload.issueId);
    if (!issue?.project_id || !issue.target_date || payload.fromDay === toDay) return;
    if (!canDrag(issue)) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("google_calendar_integration.calendar_view.no_permission") });
      return;
    }
    const delta = diffDays(payload.fromDay, toDay);
    const update: Partial<TIssue> = { target_date: addDays(issue.target_date, delta) };
    if (issue.start_date) update.start_date = addDays(issue.start_date, delta);

    // Optimistic move; SWR rolls back by refetching on error.
    void mutateIssues((current) => current?.map((i) => (i.id === issue.id ? { ...i, ...update } : i)) as TBaseIssue[], {
      revalidate: false,
    });
    try {
      await issueService.patchIssue(slug, issue.project_id, issue.id, update);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("google_calendar_integration.calendar_view.rescheduled", {
          date: renderFormattedDate(update.target_date) ?? update.target_date,
        }),
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("google_calendar_integration.calendar_view.reschedule_error") });
    } finally {
      void mutateIssues();
    }
  };

  const eventToConvertDates = eventToConvert ? eventRange(eventToConvert) : null;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <CalendarSyncHeader
        activeMonthDate={activeMonthDate}
        setActiveMonthDate={setActiveMonthDate}
        isGoogleConnected={!!status?.connected}
        onlyMine={onlyMine}
        setOnlyMine={setOnlyMine}
        showGoogleEvents={showGoogleEvents}
        setShowGoogleEvents={setShowGoogleEvents}
      />
      {isLoading && !issues ? (
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
                      canDrag={canDrag}
                      onDropIssue={(payload, toDay) => void handleDropIssue(payload, toDay)}
                      onCreateWorkItem={setEventToConvert}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          <p className="px-4 py-2 text-caption-sm-regular text-tertiary">
            {t("google_calendar_integration.calendar_view.drag_hint")}
          </p>
        </div>
      )}

      <CreateUpdateIssueModal
        isOpen={!!eventToConvert}
        onClose={() => setEventToConvert(null)}
        data={
          eventToConvert
            ? {
                name: eventToConvert.summary ?? "",
                description_html: `<p>${eventDescriptionText(eventToConvert.description)
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")
                  .replace(/\n/g, "<br />")}</p>`,
                start_date:
                  eventToConvertDates && eventToConvertDates[0] !== eventToConvertDates[1]
                    ? eventToConvertDates[0]
                    : null,
                target_date: eventToConvertDates?.[1] ?? null,
                assignee_ids: currentUser?.id ? [currentUser.id] : [],
              }
            : undefined
        }
        onSubmit={async (created) => {
          // Link the event to the new work item, so it shows up there under
          // "Reuniões" and points back to it in the calendar.
          if (!eventToConvert || !created.project_id) return;
          try {
            await issueCalendarEventService.link(slug, created.project_id, created.id, {
              google_event_id: eventToConvert.id,
              calendar_id: eventToConvert.calendar_id,
            });
          } catch {
            // The work item exists either way; linking is a nicety.
          }
          void mutateEvents();
          void mutateIssues();
        }}
      />
    </div>
  );
});
