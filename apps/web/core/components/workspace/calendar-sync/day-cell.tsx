/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { ICalendarDate, TBaseIssue, TGoogleCalendarEvent } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
// local imports
import { CalendarSyncEventPopover } from "./event-popover";
import { DRAG_MIME } from "./helpers";
import type { TDayEntry } from "./root";

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#2563eb",
};

export type TDragPayload = { issueId: string; fromDay: string };

type Props = {
  dateKey: string;
  calendarDate: ICalendarDate;
  entry: TDayEntry | undefined;
  workspaceSlug: string;
  canDrag: (issue: TBaseIssue) => boolean;
  onDropIssue: (payload: TDragPayload, toDay: string) => void;
  onCreateWorkItem: (event: TGoogleCalendarEvent) => void;
};

export const CalendarSyncDayCell = observer(function CalendarSyncDayCell(props: Props) {
  const { dateKey, calendarDate, entry, workspaceSlug, canDrag, onDropIssue, onCreateWorkItem } = props;
  const router = useAppRouter();
  const { getProjectIdentifierById } = useProject();
  const [isDragOver, setIsDragOver] = useState(false);

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
      className={cn("flex min-h-28 flex-col gap-1 p-1.5 transition-colors", {
        "bg-surface-1": !calendarDate.is_current_month,
        "bg-accent-primary/10": isDragOver,
      })}
    >
      <span
        className={cn("w-fit rounded-full px-1.5 py-0.5 text-caption-sm-medium", {
          "text-tertiary": !calendarDate.is_current_month,
          "bg-accent-primary text-white": calendarDate.is_today,
        })}
      >
        {calendarDate.day}
      </span>

      <div className="flex flex-col gap-1">
        {entry?.issues.map(({ issue, isContinuation }) => {
          const identifier = getProjectIdentifierById(issue.project_id);
          const isCompleted = (issue as TBaseIssue & { state__group?: string }).state__group === "completed";
          const draggable = canDrag(issue);
          return (
            <button
              key={issue.id}
              type="button"
              draggable={draggable}
              onDragStart={(e) => {
                const payload: TDragPayload = { issueId: issue.id, fromDay: dateKey };
                e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => router.push(`/${workspaceSlug}/browse/${identifier}-${issue.sequence_id}/`)}
              className={cn(
                "hover:bg-surface-3 truncate rounded border border-l-[3px] border-subtle-1 bg-surface-2 px-1.5 py-0.5 text-left text-caption-sm-medium",
                {
                  "cursor-grab active:cursor-grabbing": draggable,
                  "opacity-70": isContinuation,
                  "text-tertiary line-through": isCompleted,
                }
              )}
              style={{ borderLeftColor: PRIORITY_COLORS[issue.priority ?? ""] ?? undefined }}
              title={issue.name}
            >
              <span className="text-tertiary">
                {identifier}-{issue.sequence_id}
              </span>{" "}
              {issue.name}
            </button>
          );
        })}

        {entry?.events.map(({ event, isContinuation }) => (
          <CalendarSyncEventPopover
            key={event.id}
            event={event}
            isContinuation={isContinuation}
            onCreateWorkItem={onCreateWorkItem}
          />
        ))}
      </div>
    </div>
  );
});
