/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TBaseIssue, TGoogleCalendarEvent, TGoogleCalendarListEntry } from "@plane/types";
import {
  cn,
  getEventColors,
  getEventMinutes,
  isAllDayOrMultiDay,
  layoutTimedSlots,
  toLocalDateKey,
} from "@plane/utils";
// local imports
import { CalendarEventChip } from "./event-chip";
import { DRAG_MIME, dateFromKey, formatTime } from "./helpers";
import type { TDayEntry } from "./root";
import type { TDragPayload } from "./work-item-chip";
import { CalendarWorkItemChip } from "./work-item-chip";

const HOUR_PX = 48;
const FIRST_VISIBLE_HOUR = 7;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

type Props = {
  dateKeys: string[];
  entriesByDate: Map<string, TDayEntry>;
  workspaceSlug: string;
  calendarsById: Map<string, TGoogleCalendarListEntry>;
  canDrag: (issue: TBaseIssue) => boolean;
  onDropIssue: (payload: TDragPayload, toDay: string) => void;
  onOpenEvent: (event: TGoogleCalendarEvent) => void;
};

function AllDayCell(props: Props & { dateKey: string }) {
  const { dateKey, entriesByDate, workspaceSlug, calendarsById, canDrag, onDropIssue, onOpenEvent } = props;
  const [isDragOver, setIsDragOver] = useState(false);
  const entry = entriesByDate.get(dateKey);
  const banners = (entry?.events ?? []).filter(({ event }) => isAllDayOrMultiDay(event));
  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        setIsDragOver(false);
        const raw = e.dataTransfer.getData(DRAG_MIME);
        if (!raw) return;
        e.preventDefault();
        onDropIssue(JSON.parse(raw) as TDragPayload, dateKey);
      }}
      className={cn("flex min-h-10 min-w-0 flex-col gap-0.5 p-1", { "bg-accent-primary/10": isDragOver })}
    >
      {entry?.issues.map(({ issue, isContinuation }) => (
        <CalendarWorkItemChip
          key={issue.id}
          issue={issue}
          dateKey={dateKey}
          workspaceSlug={workspaceSlug}
          isContinuation={isContinuation}
          draggable={canDrag(issue)}
        />
      ))}
      {banners.map(({ event, isContinuation }) => (
        <CalendarEventChip
          key={`${event.calendar_id}-${event.id}`}
          event={{ ...event, start: event.start?.date ? event.start : { date: dateKey } }}
          calendar={calendarsById.get(event.calendar_id ?? "")}
          isContinuation={isContinuation}
          onClick={() => onOpenEvent(event)}
        />
      ))}
    </div>
  );
}

function TimedColumn(props: Props & { dateKey: string; now: Date }) {
  const { dateKey, entriesByDate, calendarsById, onOpenEvent, now } = props;
  const { t } = useTranslation();
  const timed = useMemo(
    () => (entriesByDate.get(dateKey)?.events ?? []).filter(({ event }) => !isAllDayOrMultiDay(event)),
    [entriesByDate, dateKey]
  );
  const placed = useMemo(() => {
    const slots = timed.flatMap(({ event }) => {
      const minutes = getEventMinutes(event);
      return minutes ? [{ id: `${event.calendar_id}-${event.id}`, ...minutes }] : [];
    });
    const byId = new Map(timed.map(({ event }) => [`${event.calendar_id}-${event.id}`, event]));
    return layoutTimedSlots(slots).map((slot) => ({ slot, event: byId.get(slot.id) as TGoogleCalendarEvent }));
  }, [timed]);
  const isToday = toLocalDateKey(now) === dateKey;
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX;

  return (
    <div className="relative" style={{ height: HOURS.length * HOUR_PX }}>
      {HOURS.map((hour) => (
        <div key={hour} className="border-b border-subtle" style={{ height: HOUR_PX }} />
      ))}
      {placed.map(({ slot: { id, start, end, column, columns }, event }) => {
        const colors = getEventColors(event, calendarsById.get(event.calendar_id ?? ""));
        const declined = event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined");
        const height = Math.max(((end - start) / 60) * HOUR_PX - 2, 18);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onOpenEvent(event)}
            className={cn(
              "border-surface-1 absolute overflow-hidden rounded-sm border px-1 py-0.5 text-left text-caption-sm-medium leading-tight",
              { "opacity-60": declined, "line-through": declined }
            )}
            style={{
              top: (start / 60) * HOUR_PX + 1,
              height,
              left: `calc(${(column / columns) * 100}% + 2px)`,
              width: `calc(${100 / columns}% - 4px)`,
              backgroundColor: colors.background,
              color: colors.foreground,
            }}
            title={event.summary}
          >
            <span className="flex items-center gap-1 truncate">
              {event.plane_kind === "meeting" && <Link2 className="size-3 flex-shrink-0" />}
              <span className="truncate">
                {event.summary || t("google_calendar_integration.calendar_view.no_title")}
              </span>
            </span>
            {height > 30 && event.start?.dateTime && (
              <span className="block truncate opacity-80">
                {formatTime(event.start.dateTime)}
                {event.end?.dateTime ? ` – ${formatTime(event.end.dateTime)}` : ""}
              </span>
            )}
          </button>
        );
      })}
      {isToday && (
        <div className="pointer-events-none absolute right-0 left-0 z-[1]" style={{ top: nowTop }}>
          <div className="relative h-0.5 bg-danger-primary">
            <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-danger-primary" />
          </div>
        </div>
      )}
    </div>
  );
}

export const CalendarWeekView = observer(function CalendarWeekView(props: Props) {
  const { dateKeys } = props;
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = FIRST_VISIBLE_HOUR * HOUR_PX;
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const todayKey = toLocalDateKey(now);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-subtle">
        <div />
        {dateKeys.map((dateKey) => {
          const date = dateFromKey(dateKey);
          const isToday = dateKey === todayKey;
          return (
            <div key={dateKey} className="flex flex-col items-center gap-0.5 py-1.5">
              <span className="text-caption-sm-medium text-tertiary uppercase">
                {date.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <span
                className={cn("grid size-8 place-items-center rounded-full text-body-md-medium text-primary", {
                  "bg-accent-primary text-on-color": isToday,
                })}
              >
                {date.getDate()}
              </span>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] divide-x divide-subtle border-b border-subtle">
        <span className="px-1 py-1.5 text-right text-caption-xs-regular text-tertiary">
          {t("google_calendar_integration.calendar_view.all_day")}
        </span>
        {dateKeys.map((dateKey) => (
          <AllDayCell key={dateKey} {...props} dateKey={dateKey} />
        ))}
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] divide-x divide-subtle">
          <div className="relative" style={{ height: HOURS.length * HOUR_PX }}>
            {HOURS.map((hour) =>
              hour === 0 ? null : (
                <span
                  key={hour}
                  className="absolute right-1.5 -translate-y-1/2 text-caption-xs-regular text-tertiary"
                  style={{ top: hour * HOUR_PX }}
                >
                  {`${String(hour).padStart(2, "0")}:00`}
                </span>
              )
            )}
          </div>
          {dateKeys.map((dateKey) => (
            <TimedColumn key={dateKey} {...props} dateKey={dateKey} now={now} />
          ))}
        </div>
      </div>
    </div>
  );
});
