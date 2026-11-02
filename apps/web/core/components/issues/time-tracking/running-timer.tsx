/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import Link from "next/link";
import { Square, Timer } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
// local imports
import { clockOffset, formatClock, formatDuration, runningSeconds, useNow } from "./helpers";
import { useRunningTimer, useTimeTrackingActions } from "./use-time-tracking";

/** Pespo: o cronômetro de quem está logado, no topo do Hub, em qualquer tela. Some quando não há nenhum. */
export function RunningTimerChip({ workspaceSlug }: { workspaceSlug: string }) {
  const { t } = useTranslation();
  const { data } = useRunningTimer(workspaceSlug);
  const { stop } = useTimeTrackingActions(workspaceSlug);
  const [busy, setBusy] = useState(false);
  const running = data?.running;
  const now = useNow(!!running);

  if (!running) return null;
  const elapsed = runningSeconds(running.started_at, now, clockOffset(running.now, data?.received_at));
  const href = `/${running.workspace_slug}/browse/${running.project_identifier}-${running.issue_sequence_id}/`;

  const handleStop = async () => {
    setBusy(true);
    try {
      const stopped = await stop();
      if (stopped)
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("time_tracking.stopped", { duration: formatDuration(stopped.duration_seconds) }),
        });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("time_tracking.error") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mr-1 flex h-7 max-w-64 items-center gap-1 rounded-md border border-danger-subtle bg-danger-subtle pr-0.5 pl-2 text-12">
      <Timer className="size-3.5 shrink-0 text-danger-primary" />
      <Tooltip tooltipContent={running.issue_name} position="bottom">
        <Link href={href} className="flex min-w-0 items-center gap-1.5 text-primary hover:underline">
          <span className="shrink-0 font-medium text-danger-primary tabular-nums">{formatClock(elapsed)}</span>
          <span className="truncate">{running.issue_name}</span>
        </Link>
      </Tooltip>
      <Tooltip tooltipContent={t("time_tracking.stop")} position="bottom">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleStop()}
          aria-label={t("time_tracking.stop")}
          className="grid size-6 shrink-0 place-items-center rounded-sm text-danger-primary hover:bg-danger-subtle-hover disabled:opacity-60"
        >
          <Square className="size-3 fill-current" />
        </button>
      </Tooltip>
    </div>
  );
}
