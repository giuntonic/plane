/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueServiceType } from "@plane/types";
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
  customButton: React.ReactNode;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

// Pespo: "Meet agora" — um clique cria um Google Meet começando agora no
// Google Calendar de quem clicou, convida os responsáveis e abre o Meet.
export const IssueMeetNowButton = observer(function IssueMeetNowButton(props: Props) {
  const { workspaceSlug, projectId, issueId, customButton, disabled = false, issueServiceType } = props;
  const { t } = useTranslation();
  const [isStarting, setIsStarting] = useState(false);
  const { mutate } = useIssueMeetings(workspaceSlug, projectId, issueId);
  const { fetchActivities } = useIssueDetail(issueServiceType);

  const handleStart = async () => {
    if (disabled || isStarting) return;
    // Open the tab synchronously, inside the click: a window.open after the
    // request returns would be blocked as a popup.
    const meetWindow = window.open("", "_blank");
    setIsStarting(true);
    try {
      const meeting = await issueCalendarEventService.startNow(workspaceSlug, projectId, issueId);
      if (meeting.meet_link && meetWindow) {
        meetWindow.opener = null;
        meetWindow.location.href = meeting.meet_link;
      } else {
        meetWindow?.close();
      }
      setToast({
        type: meeting.meet_link ? TOAST_TYPE.SUCCESS : TOAST_TYPE.WARNING,
        title: t(
          meeting.meet_link
            ? "google_calendar_integration.meetings.meet_now_created"
            : "google_calendar_integration.meetings.meet_now_no_link"
        ),
      });
      await mutate();
      void fetchActivities(workspaceSlug, projectId, issueId);
    } catch (error) {
      meetWindow?.close();
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t(getGoogleCalendarErrorKey(error)) });
    } finally {
      setIsStarting(false);
    }
  };

  return (
    // Not a <button>: the widget button it wraps renders its own button styling
    // (same as the other action buttons in this row).
    <div
      // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || isStarting}
      aria-busy={isStarting}
      title={t("google_calendar_integration.meetings.meet_now_tooltip")}
      className={isStarting ? "pointer-events-none opacity-60" : undefined}
      onClick={() => void handleStart()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void handleStart();
        }
      }}
    >
      {customButton}
    </div>
  );
});
