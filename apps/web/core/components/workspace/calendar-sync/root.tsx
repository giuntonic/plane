/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useState } from "react";
import { sortBy } from "lodash-es";
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
import { cn, generateCalendarData, renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
// components
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
// hooks
import { useUser, useUserPermissions } from "@/hooks/store/user";
import useLocalStorage from "@/hooks/use-local-storage";
// services
import { IssueService } from "@/services/issue";
import { issueCalendarEventService } from "@/services/issue-calendar-event.service";
import { WorkspaceService } from "@/services/workspace.service";
import userService from "@/services/user.service";
// local imports
import { CalendarEventDetailsModal } from "./event-details-modal";
import type { TCalendarView } from "./header";
import { CalendarSyncHeader } from "./header";
import {
  addDays,
  dateFromKey,
  diffDays,
  eachDay,
  eventDescriptionText,
  eventRange,
  issueRange,
  weekDateKeys,
} from "./helpers";
import { CalendarMonthView } from "./month-view";
import { CalendarSyncSidebar } from "./sidebar";
import { CalendarWeekView } from "./week-view";
import type { TDragPayload } from "./work-item-chip";

const workspaceService = new WorkspaceService();
const issueService = new IssueService();

const PAGE_SIZE = 500;
const MAX_PAGES = 10;
// Um domingo qualquer, para os nomes dos dias da semana no idioma da pessoa.
const A_SUNDAY = new Date(2024, 0, 7);

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

const sameEvent = (a: TGoogleCalendarEvent, b: TGoogleCalendarEvent) =>
  a.id === b.id && a.calendar_id === b.calendar_id;

export const WorkspaceCalendarSyncRoot = observer(function WorkspaceCalendarSyncRoot() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { t, currentLocale } = useTranslation();
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  // view state (a visão e as fontes ficam guardadas no navegador)
  const { storedValue: storedView, setValue: setStoredView } = useLocalStorage<TCalendarView>(
    "pespo_calendar_view",
    "month"
  );
  const view: TCalendarView = storedView === "week" ? "week" : "month";
  const { storedValue: storedShowWorkItems, setValue: setStoredShowWorkItems } = useLocalStorage<boolean>(
    "pespo_calendar_show_work_items",
    true
  );
  const showWorkItems = storedShowWorkItems !== false;
  const [activeDate, setActiveDate] = useState(new Date());
  const [onlyMine, setOnlyMine] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
  const [selectionOverride, setSelectionOverride] = useState<string[] | null>(null);
  const [openEvent, setOpenEvent] = useState<TGoogleCalendarEvent | null>(null);
  const [eventToConvert, setEventToConvert] = useState<TGoogleCalendarEvent | null>(null);

  // --- range -------------------------------------------------------------------
  const calendarPayload = useMemo(() => generateCalendarData(null, activeDate, EStartOfTheWeek.SUNDAY), [activeDate]);
  const monthWeeks = Object.values(
    calendarPayload[`y-${activeDate.getFullYear()}`]?.[`m-${activeDate.getMonth()}`] ?? {}
  );
  const weekKeys = useMemo(() => weekDateKeys(activeDate), [activeDate]);

  let after: string | undefined;
  let before: string | undefined;
  if (view === "week") {
    after = weekKeys[0];
    before = weekKeys[6];
  } else {
    const monthStart = monthWeeks[0] ? Object.values(monthWeeks[0])[0]?.date : undefined;
    const lastWeek = monthWeeks[monthWeeks.length - 1];
    const monthEnd = lastWeek ? Object.values(lastWeek)[6]?.date : undefined;
    after = monthStart ? renderFormattedPayloadDate(monthStart) : undefined;
    before = monthEnd ? renderFormattedPayloadDate(monthEnd) : undefined;
  }
  // Multi-day work items that start in this view but are due later still need to show up.
  const issuesBefore = before ? addDays(before, 31) : undefined;

  // --- data --------------------------------------------------------------------
  const issuesKey =
    showWorkItems && slug && after && issuesBefore
      ? ["workspace-calendar-issues", slug, after, issuesBefore, onlyMine ? currentUser?.id : "all"]
      : null;
  const {
    data: issues,
    mutate: mutateIssues,
    isLoading: isLoadingIssues,
  } = useSWR(issuesKey, () =>
    fetchIssuesInRange(slug, after as string, issuesBefore as string, onlyMine ? currentUser?.id : undefined)
  );

  const { data: status, mutate: mutateStatus } = useSWR("google-calendar-status", () =>
    userService.googleCalendarStatus()
  );
  const isGoogleConnected = !!status?.connected;

  // As agendas que o Plane mantém (espelho dos itens) ficam fora: os itens já aparecem por conta própria.
  const calendars = useMemo(
    () =>
      status?.connected
        ? sortBy(
            status.calendars.filter((calendar) => !calendar.is_plane),
            [(calendar) => !calendar.primary, (calendar) => calendar.summary.toLowerCase()]
          )
        : [],
    [status]
  );
  const calendarsById = useMemo(() => new Map(calendars.map((calendar) => [calendar.id, calendar])), [calendars]);
  const savedSelection = useMemo(() => {
    if (!status?.connected) return [];
    const saved = status.overlay_calendar_ids.filter((id) => calendarsById.has(id));
    if (saved.length > 0) return saved;
    // Nunca escolheu (ou só tinha a agenda "Plane"): começa pela agenda principal.
    const primary = calendars.find((calendar) => calendar.primary);
    return primary ? [primary.id] : [];
  }, [status, calendars, calendarsById]);
  const selectedCalendarIds = selectionOverride ?? savedSelection;

  const { data: events, mutate: mutateEvents } = useSWR(
    isGoogleConnected && after && before && selectedCalendarIds.length > 0
      ? ["google-calendar-events", after, before, selectedCalendarIds.join(",")]
      : null,
    () => userService.googleCalendarEvents(after as string, before as string, selectedCalendarIds)
  );

  const handleToggleCalendar = async (calendarId: string) => {
    const next = selectedCalendarIds.includes(calendarId)
      ? selectedCalendarIds.filter((id) => id !== calendarId)
      : [...selectedCalendarIds, calendarId];
    setSelectionOverride(next);
    try {
      await userService.updateGoogleCalendarPreferences({ overlay_calendar_ids: next });
      void mutateStatus();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("google_calendar_integration.calendar_view.save_calendars_error") });
    }
  };

  // --- entries per day -----------------------------------------------------------
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

    if (showWorkItems)
      for (const issue of issues ?? []) {
        const range = issueRange(issue);
        if (!range) continue;
        for (const day of eachDay(range, after, before)) {
          getEntry(day).issues.push({ issue, isContinuation: day !== range[0] && day !== after });
        }
      }

    // Eventos-espelho dos itens (agenda "Plane") nunca entram: o item aparece como item, respeitando os
    // filtros de itens. Antes eles reapareciam como evento mesmo com os itens filtrados.
    // Dia inteiro primeiro, depois pelo horário de início.
    const visibleEvents = sortBy(
      (events ?? []).filter((event) => event.plane_kind !== "task" && event.status !== "cancelled"),
      [(event) => (event.start?.date ? 0 : 1), (event) => event.start?.dateTime ?? event.start?.date ?? ""]
    );
    for (const event of visibleEvents) {
      const range = eventRange(event);
      if (!range) continue;
      for (const day of eachDay(range, after, before)) {
        getEntry(day).events.push({ event, isContinuation: day !== range[0] && day !== after });
      }
    }
    return map;
  }, [issues, events, after, before, showWorkItems]);

  // --- work item drag and drop ------------------------------------------------------
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

  // --- navigation ----------------------------------------------------------------
  const move = (direction: 1 | -1) =>
    setActiveDate((current) =>
      view === "week"
        ? new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7 * direction)
        : new Date(current.getFullYear(), current.getMonth() + direction, 1)
    );

  const title =
    view === "week"
      ? new Intl.DateTimeFormat(currentLocale, { day: "numeric", month: "short", year: "numeric" }).formatRange(
          dateFromKey(weekKeys[0]),
          dateFromKey(weekKeys[6])
        )
      : activeDate.toLocaleDateString(currentLocale, { month: "long", year: "numeric" });

  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    new Date(A_SUNDAY.getFullYear(), A_SUNDAY.getMonth(), A_SUNDAY.getDate() + index).toLocaleDateString(
      currentLocale,
      { weekday: "short" }
    )
  );

  const sharedViewProps = {
    entriesByDate,
    workspaceSlug: slug,
    calendarsById,
    canDrag,
    onDropIssue: (payload: TDragPayload, toDay: string) => void handleDropIssue(payload, toDay),
    onOpenEvent: setOpenEvent,
  };

  const eventToConvertDates = eventToConvert ? eventRange(eventToConvert) : null;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <CalendarSyncHeader
        title={title}
        view={view}
        setView={setStoredView}
        onPrevious={() => move(-1)}
        onNext={() => move(1)}
        onToday={() => setActiveDate(new Date())}
        onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
      />
      <div className="relative flex min-h-0 flex-1">
        <CalendarSyncSidebar
          className={cn("absolute inset-y-0 left-0 z-10 bg-surface-1 shadow-raised-200 md:static md:shadow-none", {
            hidden: !isSidebarOpen,
          })}
          isGoogleConnected={isGoogleConnected}
          googleEmail={status?.connected ? status.google_email : undefined}
          calendars={calendars}
          selectedCalendarIds={selectedCalendarIds}
          onToggleCalendar={(id) => void handleToggleCalendar(id)}
          showWorkItems={showWorkItems}
          setShowWorkItems={setStoredShowWorkItems}
          onlyMine={onlyMine}
          setOnlyMine={setOnlyMine}
        />
        <main className="relative min-w-0 flex-1 overflow-auto">
          {isLoadingIssues && !issues ? (
            <div className="grid h-full w-full place-items-center">
              <Spinner />
            </div>
          ) : view === "week" ? (
            <CalendarWeekView {...sharedViewProps} dateKeys={weekKeys} />
          ) : (
            <CalendarMonthView {...sharedViewProps} weeks={monthWeeks} weekdayLabels={weekdayLabels} />
          )}
        </main>
      </div>

      <CalendarEventDetailsModal
        event={openEvent}
        calendar={openEvent ? calendarsById.get(openEvent.calendar_id ?? "") : undefined}
        onClose={() => setOpenEvent(null)}
        onUpdated={(updated) => {
          setOpenEvent(updated);
          void mutateEvents(
            (current) => current?.map((event) => (sameEvent(event, updated) ? { ...event, ...updated } : event)),
            { revalidate: false }
          );
        }}
        onCreateWorkItem={setEventToConvert}
      />

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
