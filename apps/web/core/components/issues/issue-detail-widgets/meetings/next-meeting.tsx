/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Video } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TIssueCalendarEvent } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
// local imports
import { useIssueMeetings } from "./helper";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
};

const startOf = (meeting: TIssueCalendarEvent) => new Date(meeting.start ?? 0).getTime();
const endOf = (meeting: TIssueCalendarEvent) => new Date(meeting.end ?? meeting.start ?? 0).getTime();

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** A reunião em andamento ou a próxima, entre as vinculadas ao item. */
export function nextMeeting(meetings: TIssueCalendarEvent[] | undefined, now = Date.now()) {
  let found: TIssueCalendarEvent | undefined;
  for (const meeting of meetings ?? []) {
    if (!meeting.start || endOf(meeting) < now) continue;
    if (!found || startOf(meeting) < startOf(found)) found = meeting;
  }
  return found;
}

/** Pespo: a próxima reunião do item nas propriedades, com "Entrar" quando tem Google Meet. Some sem reunião. */
export const IssueNextMeetingProperty = observer(function IssueNextMeetingProperty(props: Props) {
  const { workspaceSlug, projectId, issueId } = props;
  const { t } = useTranslation();
  const { data: meetings } = useIssueMeetings(workspaceSlug, projectId, issueId);
  const now = Date.now();
  const meeting = nextMeeting(meetings, now);
  if (!meeting) return null;

  const start = new Date(meeting.start as string);
  const isLive = startOf(meeting) <= now && endOf(meeting) >= now;
  const today = new Date(now);
  const tomorrow = new Date(now + 24 * 3600 * 1000);
  const day = sameDay(start, today)
    ? t("google_calendar_integration.next_meeting.today")
    : sameDay(start, tomorrow)
      ? t("google_calendar_integration.next_meeting.tomorrow")
      : start.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "2-digit" });
  const time = meeting.all_day
    ? ""
    : `, ${start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <SidebarPropertyListItem icon={Video} label={t("google_calendar_integration.next_meeting.label")}>
      <div className="flex min-h-7.5 min-w-0 items-center gap-2 px-2 text-body-xs-regular">
        <a
          href={meeting.html_link}
          target="_blank"
          rel="noopener noreferrer"
          title={meeting.summary}
          className={cn("truncate hover:underline", isLive ? "font-medium text-danger-primary" : "text-primary")}
        >
          {isLive ? t("google_calendar_integration.next_meeting.now") : `${day}${time}`}
        </a>
        {meeting.meet_link && (
          <a
            href={meeting.meet_link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-6 shrink-0 items-center gap-1 rounded-sm bg-accent-primary px-2 text-11 font-medium text-on-color hover:opacity-90"
          >
            <Video className="size-3" />
            {t("google_calendar_integration.next_meeting.join")}
          </a>
        )}
      </div>
    </SidebarPropertyListItem>
  );
});
