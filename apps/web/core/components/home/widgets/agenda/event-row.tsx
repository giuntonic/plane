/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Link2, MapPin, Video } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TAgendaEntry } from "@plane/utils";
import { cn } from "@plane/utils";
// components
import { formatEventTime } from "@/components/workspace/calendar-sync/helpers";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useAppRouter } from "@/hooks/use-app-router";

type Props = {
  workspaceSlug: string;
  entry: TAgendaEntry;
};

export const AgendaEventRow = observer(function AgendaEventRow(props: Props) {
  const { workspaceSlug, entry } = props;
  const { event, meetingLink, isNow, isPast } = entry;
  const { t } = useTranslation();
  const router = useAppRouter();
  const { setPeekIssue } = useIssueDetail();
  const linkedIssue = event.plane_issue ?? null;
  const title = event.summary || t("home.agenda.untitled");

  const openLinkedIssue = () => {
    if (!linkedIssue) return;
    if (linkedIssue.workspace_slug === workspaceSlug)
      setPeekIssue({ workspaceSlug, projectId: linkedIssue.project_id, issueId: linkedIssue.id });
    else
      router.push(
        `/${linkedIssue.workspace_slug}/browse/${linkedIssue.project_identifier}-${linkedIssue.sequence_id}/`
      );
  };

  return (
    <div
      className={cn("group/agenda-event flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-layer-1", {
        "bg-accent-subtle": isNow,
        "opacity-60": isPast,
      })}
    >
      <div className="w-24 flex-shrink-0 pt-0.5 text-caption-sm-medium text-tertiary tabular-nums">
        {formatEventTime(event, t("google_calendar_integration.meetings.all_day"))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {isNow && (
            <span className="flex-shrink-0 rounded-sm bg-accent-primary px-1 text-10 font-medium text-on-color">
              {t("home.agenda.now")}
            </span>
          )}
          {event.htmlLink ? (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-13 font-medium text-primary hover:underline"
              title={title}
            >
              {title}
            </a>
          ) : (
            <span className="truncate text-13 font-medium text-primary" title={title}>
              {title}
            </span>
          )}
        </div>
        {event.location && (
          <span className="flex min-w-0 items-center gap-1 text-caption-sm-regular text-tertiary">
            <MapPin className="size-3 flex-shrink-0" />
            <span className="truncate">{event.location}</span>
          </span>
        )}
        {linkedIssue && (
          <button
            type="button"
            onClick={openLinkedIssue}
            className="flex min-w-0 items-center gap-1 text-left text-caption-sm-medium text-accent-primary hover:underline"
          >
            <Link2 className="size-3 flex-shrink-0" />
            <span className="truncate">{linkedIssue.name}</span>
          </button>
        )}
      </div>
      {meetingLink && !isPast && (
        <a
          href={meetingLink}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex flex-shrink-0 items-center gap-1 rounded-sm px-2 py-1 text-caption-sm-medium",
            isNow ? "bg-accent-primary text-on-color" : "border border-subtle text-secondary hover:bg-layer-2"
          )}
        >
          <Video className="size-3.5" />
          {t("home.agenda.join")}
        </a>
      )}
    </div>
  );
});
