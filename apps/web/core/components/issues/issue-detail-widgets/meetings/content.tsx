/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { CalendarDays, ExternalLink, Link2Off, Trash2, Video } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueCalendarEvent, TIssueServiceType } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// services
import { issueCalendarEventService } from "@/services/issue-calendar-event.service";
// local imports
import { getGoogleCalendarErrorKey, useIssueMeetings } from "./helper";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueServiceType: TIssueServiceType;
};

const formatWhen = (meeting: TIssueCalendarEvent, allDayLabel: string) => {
  if (!meeting.start) return "";
  const start = new Date(meeting.start);
  const day = start.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
  if (meeting.all_day) return `${day} · ${allDayLabel}`;
  const time: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  const end = meeting.end ? ` – ${new Date(meeting.end).toLocaleTimeString(undefined, time)}` : "";
  return `${day} · ${start.toLocaleTimeString(undefined, time)}${end}`;
};

const isPast = (meeting: TIssueCalendarEvent) => {
  const end = meeting.end ?? meeting.start;
  return !!end && new Date(end).getTime() < Date.now();
};

export const IssueMeetingsCollapsibleContent = observer(function IssueMeetingsCollapsibleContent(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled, issueServiceType } = props;
  const { t } = useTranslation();
  const { fetchActivities } = useIssueDetail(issueServiceType);
  const { data: meetings = [], mutate } = useIssueMeetings(workspaceSlug, projectId, issueId);
  const upcoming = meetings.filter((m) => !isPast(m));
  // Most recent first. filter() already returns a copy; toSorted() isn't in the web app's ES2022 lib.
  // oxlint-disable-next-line unicorn/no-array-sort
  const past = meetings.filter(isPast).sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""));

  const handleRemove = async (meeting: TIssueCalendarEvent, cancel: boolean) => {
    // eslint-disable-next-line no-alert
    if (cancel && !window.confirm(t("google_calendar_integration.meetings.cancel_confirm"))) return;
    try {
      await issueCalendarEventService.remove(workspaceSlug, projectId, issueId, meeting.id, cancel);
      await mutate();
      void fetchActivities(workspaceSlug, projectId, issueId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t(
          cancel ? "google_calendar_integration.meetings.canceled" : "google_calendar_integration.meetings.unlinked"
        ),
      });
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t(getGoogleCalendarErrorKey(error)) });
    }
  };

  const actionClassName =
    "grid size-6 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-primary";

  const renderMeeting = (meeting: TIssueCalendarEvent) => {
    const past_ = isPast(meeting);
    return (
      <li
        key={meeting.id}
        className={cn("flex items-center gap-3 rounded-md border border-subtle px-3 py-2", { "opacity-70": past_ })}
      >
        <CalendarDays className="size-4 flex-shrink-0 text-tertiary" />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-body-sm-medium text-primary">{meeting.summary}</span>
          <span className="block truncate text-caption-sm-regular text-tertiary">
            {formatWhen(meeting, t("google_calendar_integration.meetings.all_day"))}
            {meeting.attendees.length > 0 &&
              ` · ${t("google_calendar_integration.meetings.guests", { count: meeting.attendees.length })}`}
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-0.5">
          {meeting.meet_link && !past_ && (
            <a
              href={meeting.meet_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-sm bg-accent-primary px-2 py-1 text-caption-sm-medium text-on-color"
            >
              <Video className="size-3" />
              {t("google_calendar_integration.meetings.join_meet")}
            </a>
          )}
          {meeting.html_link && (
            <Tooltip tooltipContent={t("google_calendar_integration.meetings.open")}>
              <a href={meeting.html_link} target="_blank" rel="noopener noreferrer" className={actionClassName}>
                <ExternalLink className="size-3.5" />
              </a>
            </Tooltip>
          )}
          {!disabled && (
            <Tooltip tooltipContent={t("google_calendar_integration.meetings.unlink")}>
              <button type="button" className={actionClassName} onClick={() => void handleRemove(meeting, false)}>
                <Link2Off className="size-3.5" />
              </button>
            </Tooltip>
          )}
          {!disabled && meeting.is_owner && !past_ && (
            <Tooltip tooltipContent={t("google_calendar_integration.meetings.cancel")}>
              <button
                type="button"
                className={cn(actionClassName, "hover:text-danger-primary")}
                onClick={() => void handleRemove(meeting, true)}
              >
                <Trash2 className="size-3.5" />
              </button>
            </Tooltip>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-2 px-1.5 pb-2">
      {upcoming.length > 0 && <ul className="flex flex-col gap-1">{upcoming.map(renderMeeting)}</ul>}
      {past.length > 0 && (
        <>
          <span className="pt-1 text-caption-sm-medium text-tertiary">
            {t("google_calendar_integration.meetings.past")}
          </span>
          <ul className="flex flex-col gap-1">{past.map(renderMeeting)}</ul>
        </>
      )}
    </div>
  );
});
