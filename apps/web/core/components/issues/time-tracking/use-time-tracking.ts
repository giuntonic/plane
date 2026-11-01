/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";
import type { TIssueTimeEntryPayload } from "@plane/types";
// components
import { getCardExtrasKey } from "@/components/issues/card-extras";
// services
import { timeTrackingService } from "@/services/time-tracking.service";

// Pespo: tempo gasto por peça. O cronômetro de quem está logado é um só (em qualquer item) e aparece no
// topo do Hub; quem inicia ou para atualiza o item, o topo e os cards.

export const getTimeEntriesKey = (issueId: string) => `ISSUE_TIME_ENTRIES_${issueId}`;
export const getRunningTimerKey = (workspaceSlug: string) => `RUNNING_TIME_ENTRY_${workspaceSlug}`;

/** As respostas levam a hora em que chegaram, para medir a diferença de relógio (ver `clockOffset`). */
export function useRunningTimer(workspaceSlug: string | undefined) {
  return useSWR(
    workspaceSlug ? getRunningTimerKey(workspaceSlug) : null,
    async () => ({ ...(await timeTrackingService.running(workspaceSlug as string)), received_at: Date.now() }),
    { revalidateOnFocus: true, refreshInterval: 60_000 }
  );
}

export function useIssueTimeEntries(workspaceSlug: string, projectId: string, issueId: string, enabled: boolean) {
  return useSWR(enabled && issueId ? getTimeEntriesKey(issueId) : null, async () => ({
    ...(await timeTrackingService.list(workspaceSlug, projectId, issueId)),
    received_at: Date.now(),
  }));
}

export function useTimeTrackingActions(workspaceSlug: string) {
  const { mutate } = useSWRConfig();

  // o item que tinha o cronômetro (se era outro) e o novo
  const refresh = useCallback(
    (projectIds: (string | undefined)[], issueIds: (string | undefined)[]) => {
      void mutate(getRunningTimerKey(workspaceSlug));
      for (const id of new Set(issueIds)) if (id) void mutate(getTimeEntriesKey(id));
      for (const id of new Set(projectIds)) if (id) void mutate(getCardExtrasKey(id));
    },
    [mutate, workspaceSlug]
  );

  const start = useCallback(
    async (projectId: string, issueId: string) => {
      const entry = await timeTrackingService.start(workspaceSlug, projectId, issueId);
      refresh([projectId, entry.stopped?.project], [issueId, entry.stopped?.issue]);
      return entry;
    },
    [refresh, workspaceSlug]
  );

  const stop = useCallback(async () => {
    const { stopped } = await timeTrackingService.stop(workspaceSlug);
    refresh([stopped?.project], [stopped?.issue]);
    return stopped;
  }, [refresh, workspaceSlug]);

  const create = useCallback(
    async (projectId: string, issueId: string, data: TIssueTimeEntryPayload) => {
      await timeTrackingService.create(workspaceSlug, projectId, issueId, data);
      refresh([projectId], [issueId]);
    },
    [refresh, workspaceSlug]
  );

  const update = useCallback(
    async (projectId: string, issueId: string, id: string, data: TIssueTimeEntryPayload) => {
      await timeTrackingService.update(workspaceSlug, projectId, issueId, id, data);
      refresh([projectId], [issueId]);
    },
    [refresh, workspaceSlug]
  );

  const remove = useCallback(
    async (projectId: string, issueId: string, id: string) => {
      await timeTrackingService.remove(workspaceSlug, projectId, issueId, id);
      refresh([projectId], [issueId]);
    },
    [refresh, workspaceSlug]
  );

  return { start, stop, create, update, remove };
}
