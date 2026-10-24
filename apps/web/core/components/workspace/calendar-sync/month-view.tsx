/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { ICalendarDate, TBaseIssue, TGoogleCalendarEvent, TGoogleCalendarListEntry } from "@plane/types";
import { Popover } from "@plane/ui";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
// local imports
import { CalendarEventChip } from "./event-chip";
import { DRAG_MIME } from "./helpers";
import type { TDayEntry } from "./root";
import type { TDragPayload } from "./work-item-chip";
import { CalendarWorkItemChip } from "./work-item-chip";

const MAX_VISIBLE = 3;

type TSharedProps = {
  workspaceSlug: string;
  calendarsById: Map<string, TGoogleCalendarListEntry>;
  canDrag: (issue: TBaseIssue) => boolean;
  onDropIssue: (payload: TDragPayload, toDay: string) => void;
  onOpenEvent: (event: TGoogleCalendarEvent) => void;
};

/** Itens e eventos de um dia, na ordem em que aparecem. */
function DayEntries(props: TSharedProps & { dateKey: string; entry: TDayEntry; limit?: number }) {
  const { dateKey, entry, limit, workspaceSlug, calendarsById, canDrag, onOpenEvent } = props;
  const rows = [
    ...entry.issues.map(({ issue, isContinuation }) => (
      <CalendarWorkItemChip
        key={`issue-${issue.id}`}
        issue={issue}
        dateKey={dateKey}
        workspaceSlug={workspaceSlug}
        isContinuation={isContinuation}
        draggable={canDrag(issue)}
      />
    )),
    ...entry.events.map(({ event, isContinuation }) => (
      <CalendarEventChip
        key={`event-${event.calendar_id}-${event.id}`}
        event={event}
        calendar={calendarsById.get(event.calendar_id ?? "")}
        isContinuation={isContinuation}
        onClick={onOpenEvent}
      />
    )),
  ];
  return <>{limit === undefined ? rows : rows.slice(0, limit)}</>;
}

const MonthDayCell = observer(function MonthDayCell(
  props: TSharedProps & { dateKey: string; calendarDate: ICalendarDate; entry: TDayEntry | undefined }
) {
  const { dateKey, calendarDate, entry, onDropIssue } = props;
  const { t } = useTranslation();
  const [isDragOver, setIsDragOver] = useState(false);
  const total = (entry?.issues.length ?? 0) + (entry?.events.length ?? 0);
  const hidden = total - MAX_VISIBLE;

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
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
      className={cn("flex min-h-28 min-w-0 flex-col gap-0.5 p-1 transition-colors", {
        "bg-surface-2/60": !calendarDate.is_current_month,
        "bg-accent-primary/10": isDragOver,
      })}
    >
      <span
        className={cn(
          "mx-auto mb-0.5 grid size-6 place-items-center rounded-full text-caption-sm-medium text-secondary",
          {
            "text-placeholder": !calendarDate.is_current_month,
            "bg-accent-primary text-on-color": calendarDate.is_today,
          }
        )}
      >
        {calendarDate.date.getDate()}
      </span>
      {entry && <DayEntries {...props} entry={entry} limit={hidden > 0 ? MAX_VISIBLE - 1 : MAX_VISIBLE} />}
      {entry && hidden > 0 && (
        <Popover
          popperPosition="bottom-start"
          popoverClassName="h-auto justify-start"
          buttonClassName="w-full rounded-sm px-1 py-0.5 text-left text-caption-sm-medium text-tertiary hover:bg-layer-1"
          button={<span>{t("google_calendar_integration.calendar_view.more", { count: hidden + 1 })}</span>}
          panelClassName="w-64 rounded-md border-[0.5px] border-subtle-1 bg-surface-1 p-2 shadow-raised-200"
        >
          <div className="flex flex-col gap-1">
            <span className="px-1 pb-1 text-caption-md-medium text-secondary">
              {calendarDate.date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </span>
            <DayEntries {...props} entry={entry} />
          </div>
        </Popover>
      )}
    </div>
  );
});

type Props = TSharedProps & {
  weeks: Record<string, ICalendarDate>[];
  weekdayLabels: string[];
  entriesByDate: Map<string, TDayEntry>;
};

export const CalendarMonthView = observer(function CalendarMonthView(props: Props) {
  const { weeks, weekdayLabels, entriesByDate, ...shared } = props;
  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-[1] grid grid-cols-7 border-b border-subtle bg-surface-1">
        {weekdayLabels.map((label) => (
          <div key={label} className="px-2 py-1.5 text-center text-caption-sm-medium text-tertiary uppercase">
            {label}
          </div>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-fr grid-cols-1 divide-y divide-subtle">
        {weeks.map((week) => {
          const weekStartDate = Object.values(week)[0]?.date;
          const weekKey = weekStartDate ? renderFormattedPayloadDate(weekStartDate) : "";
          return (
            <div key={weekKey} className="grid grid-cols-7 divide-x divide-subtle">
              {Object.entries(week).map(([dateKey, calendarDate]) => (
                <MonthDayCell
                  key={dateKey}
                  {...shared}
                  dateKey={dateKey}
                  calendarDate={calendarDate}
                  entry={entriesByDate.get(dateKey)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
});
