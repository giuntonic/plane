/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Link2, MapPin, Plus, SquareArrowOutUpRight, Users, Video } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TGoogleCalendarEvent } from "@plane/types";
import { Popover } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// local imports
import { eventDescriptionText, formatEventTime, meetLink } from "./helpers";

type Props = {
  event: TGoogleCalendarEvent;
  isContinuation: boolean;
  onCreateWorkItem: (event: TGoogleCalendarEvent) => void;
};

const MAX_ATTENDEES_SHOWN = 8;

// Pespo: detalhes de um evento do Google no calendário do Plane — horário,
// local, convidados, link do Meet, item de trabalho vinculado e "criar item de
// trabalho a partir deste evento".
export const CalendarSyncEventPopover = observer(function CalendarSyncEventPopover(props: Props) {
  const { event, isContinuation, onCreateWorkItem } = props;
  const { t } = useTranslation();
  const router = useAppRouter();
  const title = event.summary || t("google_calendar_integration.calendar_view.no_title");
  const link = meetLink(event);
  const description = eventDescriptionText(event.description);
  const attendees = event.attendees ?? [];
  const linkedIssue = event.plane_issue;

  return (
    <Popover
      popperPosition="bottom-start"
      buttonClassName={cn(
        "border-subtle-2 block w-full truncate rounded border border-dashed px-1.5 py-0.5 text-left text-caption-sm-medium text-secondary hover:bg-surface-2",
        { "border-solid bg-accent-primary/5": event.plane_kind === "meeting", "opacity-70": isContinuation }
      )}
      button={
        <span className="flex items-center gap-1">
          {event.plane_kind === "meeting" && <Link2 className="size-3 flex-shrink-0 text-accent-primary" />}
          {!event.start?.date && event.start?.dateTime && (
            <span className="text-tertiary">
              {new Date(event.start.dateTime).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <span className="truncate">{title}</span>
        </span>
      }
      panelClassName="w-80 max-w-xs rounded-md border-[0.5px] border-subtle-1 bg-surface-1 p-3 shadow-raised-200"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-13 font-semibold text-primary">{title}</p>
          <p className="text-caption-sm-medium text-tertiary">
            {formatEventTime(event, t("google_calendar_integration.meetings.all_day"))}
          </p>
        </div>

        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-fit items-center gap-1.5 rounded-sm bg-accent-primary px-2 py-1 text-caption-sm-medium text-on-color"
          >
            <Video className="size-3.5" />
            {t("google_calendar_integration.meetings.join_meet")}
          </a>
        )}

        {event.location && (
          <p className="flex items-start gap-1.5 text-caption-sm-regular text-secondary">
            <MapPin className="mt-0.5 size-3 flex-shrink-0" />
            <span className="break-words">{event.location}</span>
          </p>
        )}

        {attendees.length > 0 && (
          <div className="flex items-start gap-1.5 text-caption-sm-regular text-secondary">
            <Users className="mt-0.5 size-3 flex-shrink-0" />
            <div className="flex min-w-0 flex-col">
              {attendees.slice(0, MAX_ATTENDEES_SHOWN).map((attendee) => (
                <span
                  key={attendee.email}
                  className={cn("truncate", { "text-tertiary line-through": attendee.responseStatus === "declined" })}
                >
                  {attendee.displayName || attendee.email}
                </span>
              ))}
              {attendees.length > MAX_ATTENDEES_SHOWN && (
                <span className="text-tertiary">+{attendees.length - MAX_ATTENDEES_SHOWN}</span>
              )}
            </div>
          </div>
        )}

        {description && (
          <p className="max-h-32 overflow-y-auto text-caption-sm-regular whitespace-pre-wrap text-secondary">
            {description}
          </p>
        )}

        <div className="flex flex-col gap-1 border-t border-subtle pt-2">
          {linkedIssue ? (
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/${linkedIssue.workspace_slug}/browse/${linkedIssue.project_identifier}-${linkedIssue.sequence_id}/`
                )
              }
              className="flex items-center gap-1 text-left text-caption-sm-medium text-accent-primary hover:underline"
            >
              <Link2 className="size-3 flex-shrink-0" />
              <span className="truncate">
                {t("google_calendar_integration.calendar_view.linked_work_item")}: {linkedIssue.project_identifier}-
                {linkedIssue.sequence_id} {linkedIssue.name}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onCreateWorkItem(event)}
              className="flex items-center gap-1 text-left text-caption-sm-medium text-accent-primary hover:underline"
            >
              <Plus className="size-3" />
              {t("google_calendar_integration.calendar_view.create_work_item")}
            </button>
          )}
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-caption-sm-medium text-secondary hover:text-primary hover:underline"
            >
              {t("google_calendar_integration.meetings.open")}
              <SquareArrowOutUpRight className="size-3" />
            </a>
          )}
        </div>
      </div>
    </Popover>
  );
});
