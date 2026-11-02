/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { FileAudio, Loader2, RotateCcw, Trash2 } from "lucide-react";
import useSWR from "swr";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TMeetingRecording } from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";
// components
import { formatDuration } from "@/components/issues/time-tracking/helpers";
// hooks
import { useUser, useUserPermissions } from "@/hooks/store/user";
// services
import { meetingRecordingService } from "@/services/meeting-recording.service";
// local imports
import { PROCESSING_STATUSES, getMeetingRecordingsKey } from "./keys";
import { MeetingRecordingModal } from "./recording-modal";

type Props = { workspaceSlug: string; projectId: string; issueId: string };

export function useMeetingRecordings(workspaceSlug: string, projectId: string, issueId: string, enabled = true) {
  return useSWR(
    enabled && issueId ? getMeetingRecordingsKey(issueId) : null,
    () => meetingRecordingService.list({ workspaceSlug, projectId, issueId }),
    {
      revalidateOnFocus: false,
      refreshInterval: (data) => (data?.some((r) => PROCESSING_STATUSES.has(r.status)) ? 15_000 : 0),
    }
  );
}

/** Pespo: as reuniões gravadas do item, com o estado da transcrição e da ata. Só a equipe vê. */
export const IssueMeetingRecordings = observer(function IssueMeetingRecordings(props: Props) {
  const { workspaceSlug, projectId, issueId } = props;
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const isTeam = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);
  const { data: recordings = [], mutate } = useMeetingRecordings(workspaceSlug, projectId, issueId, isTeam);
  const [openId, setOpenId] = useState<string | null>(null);
  const reference = { workspaceSlug, projectId, issueId };

  if (!isTeam || recordings.length === 0) return null;

  const retry = async (recording: TMeetingRecording) => {
    try {
      await meetingRecordingService.retry(reference, recording.id);
      await mutate();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("meeting_recording.error") });
    }
  };

  const remove = async (recording: TMeetingRecording) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t("meeting_recording.delete_confirm"))) return;
    try {
      await meetingRecordingService.remove(reference, recording.id);
      await mutate();
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("meeting_recording.deleted") });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("meeting_recording.error") });
    }
  };

  const badge = (recording: TMeetingRecording) => {
    if (recording.status === "ready" && recording.summary_status !== "none")
      return {
        text: t(`meeting_recording.summary_status.${recording.summary_status}`),
        tone: recording.summary_status,
      };
    return { text: t(`meeting_recording.status.${recording.status}`), tone: recording.status };
  };

  const actionClassName =
    "grid size-6 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-primary";

  return (
    <>
      <span className="pt-1 text-caption-sm-medium text-tertiary">{t("meeting_recording.list_title")}</span>
      <ul className="flex flex-col gap-1">
        {recordings.map((recording) => {
          const { text, tone } = badge(recording);
          const processing = PROCESSING_STATUSES.has(recording.status);
          return (
            <li key={recording.id} className="flex items-center gap-3 rounded-md border border-subtle px-3 py-2">
              <FileAudio className="size-4 shrink-0 text-tertiary" />
              <button type="button" onClick={() => setOpenId(recording.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-body-sm-medium text-primary hover:underline">
                  {recording.title}
                </span>
                <span className="block truncate text-caption-sm-regular text-tertiary">
                  {renderFormattedDate(recording.started_at)}
                  {recording.duration_seconds > 0 && ` · ${formatDuration(recording.duration_seconds)}`}
                  {recording.created_by_name && ` · ${t("meeting_recording.by", { name: recording.created_by_name })}`}
                </span>
              </button>
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-caption-sm-medium",
                  tone === "published" && "bg-success-subtle text-success-primary",
                  tone === "failed" && "bg-danger-subtle text-danger-primary",
                  (tone === "draft" || tone === "ready") && "bg-layer-1 text-secondary",
                  processing && "bg-warning-subtle text-warning-primary"
                )}
              >
                {processing && <Loader2 className="size-3 animate-spin" />}
                {text}
              </span>
              <div className="flex shrink-0 items-center gap-0.5">
                {recording.status === "failed" && (
                  <Tooltip tooltipContent={t("meeting_recording.retry")}>
                    <button type="button" className={actionClassName} onClick={() => void retry(recording)}>
                      <RotateCcw className="size-3.5" />
                    </button>
                  </Tooltip>
                )}
                {(recording.created_by === currentUser?.id || isAdmin) && recording.status !== "recording" && (
                  <Tooltip tooltipContent={t("meeting_recording.delete")}>
                    <button
                      type="button"
                      className={cn(actionClassName, "hover:text-danger-primary")}
                      onClick={() => void remove(recording)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </Tooltip>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <MeetingRecordingModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        recordingId={openId}
        onClose={() => setOpenId(null)}
      />
    </>
  );
});
