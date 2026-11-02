/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Circle } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueCalendarEvent } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { meetingRecorder, useMeetingRecorder } from "./recorder";
import { StartRecordingModal } from "./start-modal";

// O botão aparece de 15 min antes do começo até 1 h depois do fim marcado.
const BEFORE_MS = 15 * 60_000;
const AFTER_MS = 60 * 60_000;

export const isRecordable = (meeting: TIssueCalendarEvent, now = Date.now()) => {
  if (!meeting.start || meeting.all_day) return false;
  const start = new Date(meeting.start).getTime();
  const end = new Date(meeting.end ?? meeting.start).getTime();
  return now >= start - BEFORE_MS && now <= end + AFTER_MS;
};

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  meeting?: TIssueCalendarEvent;
  className?: string;
};

/** Pespo: "Gravar" na reunião do item. Durante a gravação deste item, mostra que está gravando. */
export const MeetingRecordButton = observer(function MeetingRecordButton(props: Props) {
  const { workspaceSlug, projectId, issueId, meeting, className } = props;
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const state = useMeetingRecorder();
  const { getProjectById } = useProject();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const issue = getIssueById(issueId);
  const project = getProjectById(projectId);
  const label = issue && project ? `${project.identifier}-${issue.sequence_id}` : "";
  const recordingHere = state.status !== "idle" && state.ref?.issueId === issueId;

  if (recordingHere) {
    return (
      <span
        className={cn(
          "flex h-6 shrink-0 items-center gap-1 rounded-sm bg-danger-subtle px-2 text-11 font-medium text-danger-primary",
          className
        )}
      >
        <Circle className="size-2.5 animate-pulse fill-current" />
        {t("meeting_recording.recording")}
      </span>
    );
  }

  return (
    <>
      <Tooltip tooltipContent={t("meeting_recording.record_tooltip")} position="top">
        <button
          type="button"
          disabled={state.status !== "idle"}
          onClick={() => setIsOpen(true)}
          className={cn(
            "flex h-6 shrink-0 items-center gap-1 rounded-sm border border-danger-subtle px-2 text-11 font-medium text-danger-primary hover:bg-danger-subtle disabled:opacity-50",
            className
          )}
        >
          <Circle className="size-2.5 fill-current" />
          {t("meeting_recording.record")}
        </button>
      </Tooltip>
      <StartRecordingModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        issueLabel={label}
        calendarEventId={meeting?.id}
      />
    </>
  );
});

type ActionProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  customButton: React.ReactNode;
};

/** Pespo: "Gravar reunião" na barra de ações do item, para uma reunião que não foi marcada pelo Hub (uma
 * ligação, uma reunião presencial com o notebook, o Meet de outra pessoa). Só a equipe vê. */
export const RecordMeetingActionButton = observer(function RecordMeetingActionButton(props: ActionProps) {
  const { workspaceSlug, projectId, issueId, customButton } = props;
  const [isOpen, setIsOpen] = useState(false);
  const state = useMeetingRecorder();
  const { getProjectById } = useProject();
  const { allowPermissions } = useUserPermissions();
  const {
    issue: { getIssueById },
    setLastWidgetAction,
  } = useIssueDetail();
  const isTeam = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );
  if (!isTeam) return null;
  const issue = getIssueById(issueId);
  const project = getProjectById(projectId);
  const label = issue && project ? `${project.identifier}-${issue.sequence_id}` : "";
  const busy = state.status !== "idle";

  return (
    <>
      <button type="button" disabled={busy} onClick={() => setIsOpen(true)} className="disabled:opacity-50">
        {customButton}
      </button>
      <StartRecordingModal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          // começou a gravar: abre a seção de reuniões, onde a gravação aparece
          if (meetingRecorder.getSnapshot().status === "recording") setLastWidgetAction("meetings");
        }}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        issueLabel={label}
      />
    </>
  );
});
