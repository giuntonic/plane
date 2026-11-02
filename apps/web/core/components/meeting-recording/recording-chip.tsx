/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import Link from "next/link";
import { CircleStop, Loader2, MicOff } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
// components
import { formatClock, useNow } from "@/components/issues/time-tracking/helpers";
// local imports
import { meetingRecorder, useMeetingRecorder } from "./recorder";

/** Pespo: a gravação em andamento, no topo do Hub, em qualquer tela. Some quando não há gravação. */
export function MeetingRecordingChip() {
  const { t } = useTranslation();
  const state = useMeetingRecorder();
  const active = state.status === "recording" || state.status === "stopping";
  const now = useNow(state.status === "recording");

  // erros que aparecem depois do clique (escolha da aba, envio do áudio)
  useEffect(() => {
    if (!state.error) return;
    setToast({ type: TOAST_TYPE.ERROR, title: t(`meeting_recording.errors.${state.error.toLowerCase()}`) });
    meetingRecorder.clearError();
  }, [state.error, t]);

  if (!active || !state.ref) return null;
  const elapsed = Math.max(0, Math.floor((now - state.startedAt) / 1000));
  const href = `/${state.ref.workspaceSlug}/browse/${state.label}/`;

  return (
    <div className="mr-1 flex h-7 max-w-64 items-center gap-1 rounded-md border border-danger-subtle bg-danger-subtle pr-0.5 pl-2 text-12">
      <span className="relative flex size-2.5 shrink-0">
        {state.status === "recording" && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger-primary opacity-60" />
        )}
        <span className="relative inline-flex size-2.5 rounded-full bg-danger-primary" />
      </span>
      <Tooltip
        tooltipContent={state.hasMic ? t("meeting_recording.recording") : t("meeting_recording.no_mic")}
        position="bottom"
      >
        <Link href={href} className="flex min-w-0 items-center gap-1.5 text-primary hover:underline">
          <span className="shrink-0 font-medium text-danger-primary tabular-nums">
            {state.status === "stopping" ? t("meeting_recording.stopping") : formatClock(elapsed)}
          </span>
          {!state.hasMic && <MicOff className="size-3 shrink-0 text-danger-primary" />}
          <span className="truncate">{state.label}</span>
        </Link>
      </Tooltip>
      <Tooltip tooltipContent={t("meeting_recording.stop")} position="bottom">
        <button
          type="button"
          disabled={state.status === "stopping"}
          onClick={() => void meetingRecorder.stop()}
          aria-label={t("meeting_recording.stop")}
          className="grid size-6 shrink-0 place-items-center rounded-sm text-danger-primary hover:bg-danger-subtle-hover disabled:opacity-60"
        >
          {state.status === "stopping" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CircleStop className="size-3.5" />
          )}
        </button>
      </Tooltip>
    </div>
  );
}
