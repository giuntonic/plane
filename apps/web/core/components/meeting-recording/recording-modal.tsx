/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { X } from "lucide-react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
// components
import { formatDuration } from "@/components/issues/time-tracking/helpers";
// services
import { meetingRecordingService } from "@/services/meeting-recording.service";
// local imports
import { PROCESSING_STATUSES, getMeetingRecordingKey } from "./keys";
import { MeetingMinutesEditor } from "./minutes-editor";
import { MeetingTranscriptView } from "./transcript-view";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  recordingId: string | null;
  onClose: () => void;
};

/** Pespo: uma reunião gravada: a ata (para escrever e publicar) e a transcrição com o áudio. */
export const MeetingRecordingModal = observer(function MeetingRecordingModal(props: Props) {
  const { workspaceSlug, projectId, issueId, recordingId, onClose } = props;
  const { t } = useTranslation();
  const [tab, setTab] = useState<"minutes" | "transcript">("minutes");
  const reference = { workspaceSlug, projectId, issueId };
  const { data: recording } = useSWR(
    recordingId ? getMeetingRecordingKey(recordingId) : null,
    async () => ({
      ...(await meetingRecordingService.retrieve(reference, recordingId as string)),
      received_at: Date.now(),
    }),
    {
      revalidateOnFocus: false,
      // enquanto o servidor transcreve, pergunta de novo a cada 10 s
      refreshInterval: (data) => (data && PROCESSING_STATUSES.has(data.status) ? 10_000 : 0),
    }
  );

  return (
    <ModalCore isOpen={!!recordingId} handleClose={onClose} width={EModalWidth.XXXXL} preventOutsideClick>
      <div className="flex items-start justify-between gap-3 border-b border-subtle px-5 pt-4">
        <div className="flex min-w-0 flex-col gap-0.5 pb-3">
          <h3 className="truncate text-h5-medium text-primary">{recording?.title || "…"}</h3>
          {recording && (
            <span className="text-caption-sm-regular text-tertiary">
              {renderFormattedDate(recording.started_at)}
              {recording.duration_seconds > 0 && ` · ${formatDuration(recording.duration_seconds)}`}
              {recording.created_by_name && ` · ${t("meeting_recording.by", { name: recording.created_by_name })}`}
              {` · ${t(`meeting_recording.status.${recording.status}`)}`}
            </span>
          )}
          <div className="mt-2 flex gap-4">
            {(["minutes", "transcript"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "-mb-3 border-b-2 pb-2 text-body-sm-medium",
                  tab === key
                    ? "border-accent-strong text-primary"
                    : "border-transparent text-tertiary hover:text-primary"
                )}
              >
                {t(`meeting_recording.tabs.${key}`)}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="grid size-7 shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
        >
          <X className="size-4" />
        </button>
      </div>
      {!recording ? (
        <Loader className="flex flex-col gap-3 p-5">
          <Loader.Item height="80px" />
          <Loader.Item height="200px" />
        </Loader>
      ) : tab === "minutes" ? (
        <MeetingMinutesEditor key={recording.id} reference={reference} recording={recording} />
      ) : (
        <MeetingTranscriptView reference={reference} recording={recording} />
      )}
    </ModalCore>
  );
});
