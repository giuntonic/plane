/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import type { TBaseIssue } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
// local imports
import { DRAG_MIME } from "./helpers";

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#2563eb",
};

export type TDragPayload = { issueId: string; fromDay: string };

type Props = {
  issue: TBaseIssue;
  dateKey: string;
  workspaceSlug: string;
  isContinuation: boolean;
  draggable: boolean;
};

/** Item de trabalho num dia do calendário: borda pela prioridade, arrastável para outro dia. */
export const CalendarWorkItemChip = observer(function CalendarWorkItemChip(props: Props) {
  const { issue, dateKey, workspaceSlug, isContinuation, draggable } = props;
  const router = useAppRouter();
  const { getProjectIdentifierById } = useProject();
  const identifier = getProjectIdentifierById(issue.project_id);
  const isCompleted = (issue as TBaseIssue & { state__group?: string }).state__group === "completed";

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        const payload: TDragPayload = { issueId: issue.id, fromDay: dateKey };
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => router.push(`/${workspaceSlug}/browse/${identifier}-${issue.sequence_id}/`)}
      className={cn(
        "block w-full truncate rounded-sm border border-l-[3px] border-subtle bg-layer-1 px-1.5 py-0.5 text-left text-caption-sm-medium text-primary hover:bg-layer-1-hover",
        {
          "cursor-grab active:cursor-grabbing": draggable,
          "opacity-60": isContinuation,
          "text-tertiary line-through": isCompleted,
        }
      )}
      style={{ borderLeftColor: PRIORITY_COLORS[issue.priority ?? ""] ?? undefined }}
      title={issue.name}
    >
      {issue.name}
    </button>
  );
});
