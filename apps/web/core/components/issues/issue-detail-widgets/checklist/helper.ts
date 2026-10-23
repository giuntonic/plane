/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueChecklistItem, TIssueChecklistItemPayload } from "@plane/types";
// components
import type { TChecklistTreeOperations } from "@/components/checklist-tree";
import { useChecklistTreeOperations } from "@/components/checklist-tree";
// services
import { issueChecklistService } from "@/services/issue-checklist.service";

export const getIssueChecklistKey = (issueId: string) => `ISSUE_CHECKLIST_ITEMS_${issueId}`;

// ---------- data + operations ----------

/** Checklist lines of a work item. Shared SWR key, so the header count, the action button and the list stay in sync. */
export const useIssueChecklistItems = (workspaceSlug: string, projectId: string, issueId: string) =>
  useSWR(workspaceSlug && projectId && issueId ? getIssueChecklistKey(issueId) : null, () =>
    issueChecklistService.list(workspaceSlug, projectId, issueId)
  );

export type TChecklistOperations = TChecklistTreeOperations<TIssueChecklistItem, TIssueChecklistItemPayload>;

export const useIssueChecklistOperations = (
  workspaceSlug: string,
  projectId: string,
  issueId: string
): TChecklistOperations => {
  const { t } = useTranslation();
  return useChecklistTreeOperations<TIssueChecklistItem, TIssueChecklistItemPayload>({
    key: workspaceSlug && projectId && issueId ? getIssueChecklistKey(issueId) : null,
    list: () => issueChecklistService.list(workspaceSlug, projectId, issueId),
    create: (payload) => issueChecklistService.create(workspaceSlug, projectId, issueId, payload),
    update: (id, payload) => issueChecklistService.update(workspaceSlug, projectId, issueId, id, payload),
    remove: (id) => issueChecklistService.remove(workspaceSlug, projectId, issueId, id),
    serverFields: ["completed_at", "updated_at"],
    errorMessage: t("issue_checklist.save_error"),
  });
};
