/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Play, Square, Timer } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueTimeEntries } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { clockOffset, formatClock, formatDuration, runningSeconds, useNow } from "./helpers";
import { useIssueTimeEntries, useRunningTimer, useTimeTrackingActions } from "./use-time-tracking";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
};

/** Quem vê o tempo do item: a equipe sempre; o cliente (convidado) só se o projeto mostra. */
export function useTimeTrackingAccess(workspaceSlug: string, projectId: string) {
  const { allowPermissions } = useUserPermissions();
  const { getProjectById } = useProject();
  const isTeam = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);
  const clientVisible = !!getProjectById(projectId)?.time_tracking_client_visible;
  return { isTeam, isAdmin, canSee: isTeam || clientVisible };
}

/** Total ao vivo: o servidor manda o total até a hora da busca; os lançamentos rodando continuam contando. */
export function useLiveTotal(data: (TIssueTimeEntries & { received_at: number }) | undefined) {
  const running = (data?.entries ?? []).filter((entry) => entry.is_running);
  const now = useNow(running.length > 0);
  if (!data) return 0;
  const offset = clockOffset(data.now, data.received_at);
  return running.reduce(
    (total, entry) => total - entry.duration_seconds + runningSeconds(entry.started_at, now, offset),
    data.total_seconds
  );
}

export const IssueTimeProperty = observer(function IssueTimeProperty(props: Props) {
  const { workspaceSlug, projectId, issueId } = props;
  const { t } = useTranslation();
  const { isTeam, canSee } = useTimeTrackingAccess(workspaceSlug, projectId);
  const { data } = useIssueTimeEntries(workspaceSlug, projectId, issueId, canSee);
  const { data: runningData } = useRunningTimer(isTeam ? workspaceSlug : undefined);
  const { start, stop } = useTimeTrackingActions(workspaceSlug);
  const [busy, setBusy] = useState(false);
  const total = useLiveTotal(data);
  const running = runningData?.running;
  const isRunningHere = !!running && running.issue === issueId;
  const now = useNow(isRunningHere);
  const elapsed =
    running && isRunningHere
      ? runningSeconds(running.started_at, now, clockOffset(running.now, runningData?.received_at))
      : 0;

  if (!canSee) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (isRunningHere) await stop();
      else {
        const result = await start(projectId, issueId);
        if (result.stopped && result.stopped.issue !== issueId)
          setToast({
            type: TOAST_TYPE.INFO,
            title: t("time_tracking.switched", { duration: formatDuration(result.stopped.duration_seconds) }),
          });
      }
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("time_tracking.error") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidebarPropertyListItem icon={Timer} label={t("time_tracking.label")}>
      <div className="flex min-h-7.5 items-center gap-2 px-2 text-body-xs-regular">
        <span className={cn("tabular-nums", total ? "text-primary" : "text-placeholder")}>
          {total ? formatDuration(total) : t("time_tracking.none")}
        </span>
        {isTeam && (
          <Tooltip tooltipContent={isRunningHere ? t("time_tracking.stop") : t("time_tracking.start")} position="top">
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggle()}
              aria-label={isRunningHere ? t("time_tracking.stop") : t("time_tracking.start")}
              className={cn(
                "flex h-6 items-center gap-1 rounded-sm border px-1.5 text-11 font-medium disabled:opacity-60",
                isRunningHere
                  ? "border-danger-subtle bg-danger-subtle text-danger-primary"
                  : "border-subtle text-secondary hover:bg-layer-transparent-hover"
              )}
            >
              {isRunningHere ? <Square className="size-3 fill-current" /> : <Play className="size-3 fill-current" />}
              {isRunningHere ? formatClock(elapsed) : t("time_tracking.start_short")}
            </button>
          </Tooltip>
        )}
      </div>
    </SidebarPropertyListItem>
  );
});
