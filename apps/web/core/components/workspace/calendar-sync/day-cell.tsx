/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { SquareArrowOutUpRight } from "lucide-react";
// plane imports
import type { ICalendarDate, TGoogleCalendarEvent } from "@plane/types";
import { Popover } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
// local imports
import type { TDayEntry } from "./root";

const formatEventTime = (event: TGoogleCalendarEvent) => {
  if (event.start?.date) return "Dia inteiro";
  if (!event.start?.dateTime) return "";
  const timeOptions: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  const start = new Date(event.start.dateTime).toLocaleTimeString("pt-BR", timeOptions);
  const end = event.end?.dateTime ? new Date(event.end.dateTime).toLocaleTimeString("pt-BR", timeOptions) : undefined;
  return end ? `${start} – ${end}` : start;
};

type Props = {
  dateKey: string;
  calendarDate: ICalendarDate;
  entry: TDayEntry | undefined;
  workspaceSlug: string;
};

export const CalendarSyncDayCell = observer(function CalendarSyncDayCell(props: Props) {
  const { calendarDate, entry, workspaceSlug } = props;
  const router = useAppRouter();
  const { getProjectIdentifierById } = useProject();

  return (
    <div
      className={cn("flex min-h-28 flex-col gap-1 p-1.5", {
        "bg-surface-1": !calendarDate.is_current_month,
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
        {entry?.issues.map((issue) => {
          const identifier = getProjectIdentifierById(issue.project_id);
          return (
            <button
              key={issue.id}
              type="button"
              onClick={() => router.push(`/${workspaceSlug}/browse/${identifier}-${issue.sequence_id}/`)}
              className="hover:bg-surface-3 truncate rounded border border-subtle-1 bg-surface-2 px-1.5 py-0.5 text-left text-caption-sm-medium"
              title={issue.name}
            >
              <span className="text-tertiary">
                {identifier}-{issue.sequence_id}
              </span>{" "}
              {issue.name}
            </button>
          );
        })}

        {entry?.events.map((event) => (
          <Popover
            key={event.id}
            popperPosition="bottom-start"
            buttonClassName="block w-full truncate rounded border border-dashed border-subtle-2 px-1.5 py-0.5 text-left text-caption-sm-medium text-secondary hover:bg-surface-2"
            button={event.summary || "(sem título)"}
            panelClassName="w-72 max-w-xs rounded-md border-[0.5px] border-subtle-1 bg-surface-1 p-3 shadow-raised-200"
          >
            <div className="flex flex-col gap-1.5">
              <p className="text-13 font-semibold text-primary">{event.summary || "(sem título)"}</p>
              <p className="text-caption-sm-medium text-tertiary">{formatEventTime(event)}</p>
              {event.description && (
                <p className="max-h-40 overflow-y-auto text-caption-sm-regular whitespace-pre-wrap text-secondary">
                  {event.description}
                </p>
              )}
              {event.htmlLink && (
                <a
                  href={event.htmlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-caption-sm-medium text-accent-primary hover:underline"
                >
                  Abrir no Google Calendar
                  <SquareArrowOutUpRight className="size-3" />
                </a>
              )}
            </div>
          </Popover>
        ))}
      </div>
    </div>
  );
});
