/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Link2 } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TGoogleCalendarEvent, TGoogleCalendarListEntry } from "@plane/types";
import { cn, getEventColors } from "@plane/utils";
// local imports
import { formatTime } from "./helpers";

type Props = {
  event: TGoogleCalendarEvent;
  calendar: TGoogleCalendarListEntry | undefined;
  isContinuation?: boolean;
  onClick: (event: TGoogleCalendarEvent) => void;
};

/** Evento do Google num dia do mês: dia inteiro vem preenchido com a cor da agenda; com horário, um
 * ponto da cor + hora + título (como no Google Calendar). */
export function CalendarEventChip(props: Props) {
  const { event, calendar, isContinuation = false, onClick } = props;
  const { t } = useTranslation();
  const colors = getEventColors(event, calendar);
  const title = event.summary || t("google_calendar_integration.calendar_view.no_title");
  const isAllDay = !!event.start?.date || !event.start?.dateTime;
  const declined = event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined");

  if (isAllDay)
    return (
      <button
        type="button"
        onClick={() => onClick(event)}
        className={cn(
          "flex w-full items-center gap-1 truncate rounded-sm px-1.5 py-0.5 text-left text-caption-sm-medium",
          {
            "opacity-60": isContinuation || declined,
            "line-through": declined,
          }
        )}
        style={{ backgroundColor: colors.background, color: colors.foreground }}
        title={title}
      >
        {event.plane_kind === "meeting" && <Link2 className="size-3 flex-shrink-0" />}
        <span className="truncate">{title}</span>
      </button>
    );

  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded-sm px-1 py-0.5 text-left text-caption-sm-medium text-primary hover:bg-layer-1",
        { "opacity-60": isContinuation, "text-tertiary line-through": declined }
      )}
      title={title}
    >
      <span className="size-2 flex-shrink-0 rounded-full" style={{ backgroundColor: colors.background }} />
      {event.start?.dateTime && <span className="flex-shrink-0 text-tertiary">{formatTime(event.start.dateTime)}</span>}
      {event.plane_kind === "meeting" && <Link2 className="size-3 flex-shrink-0 text-accent-primary" />}
      <span className="truncate">{title}</span>
    </button>
  );
}
