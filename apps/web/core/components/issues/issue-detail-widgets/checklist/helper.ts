/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR, { useSWRConfig } from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueChecklist, TIssueChecklistItem, TIssueChecklistItemPayload } from "@plane/types";
// components
import type { TChecklistTreeOperations } from "@/components/checklist-tree";
import { useChecklistTreeOperations } from "@/components/checklist-tree";
// services
import { issueChecklistService } from "@/services/issue-checklist.service";

export const getIssueChecklistKey = (issueId: string) => `ISSUE_CHECKLIST_ITEMS_${issueId}`;
export const getIssueNamedChecklistsKey = (issueId: string) => `ISSUE_NAMED_CHECKLISTS_${issueId}`;

// ---------- data + operations ----------

/** Checklist lines of a work item. Shared SWR key, so the header count, the action button and the list stay in sync. */
export const useIssueChecklistItems = (workspaceSlug: string, projectId: string, issueId: string) =>
  useSWR(workspaceSlug && projectId && issueId ? getIssueChecklistKey(issueId) : null, () =>
    issueChecklistService.list(workspaceSlug, projectId, issueId)
  );

export type TChecklistOperations = TChecklistTreeOperations<TIssueChecklistItem, TIssueChecklistItemPayload>;

/**
 * Operations of one list of the work item: `checklistId` null = the default list ("Subtarefas"), an id =
 * that named checklist. All lists share the same SWR key (one request for every line of the item).
 */
export const useIssueChecklistOperations = (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  checklistId: string | null = null
): TChecklistOperations => {
  const { t } = useTranslation();
  return useChecklistTreeOperations<TIssueChecklistItem, TIssueChecklistItemPayload>({
    scope: { filter: (item) => (item.checklist ?? null) === checklistId, payload: { checklist: checklistId } },
    key: workspaceSlug && projectId && issueId ? getIssueChecklistKey(issueId) : null,
    list: () => issueChecklistService.list(workspaceSlug, projectId, issueId),
    create: (payload) => issueChecklistService.create(workspaceSlug, projectId, issueId, payload),
    update: (id, payload) => issueChecklistService.update(workspaceSlug, projectId, issueId, id, payload),
    remove: (id) => issueChecklistService.remove(workspaceSlug, projectId, issueId, id),
    // is_completed e state: o servidor acerta um pelo outro (ver extras.tsx).
    serverFields: ["completed_at", "updated_at", "is_completed", "state"],
    errorMessage: t("issue_checklist.save_error"),
  });
};

// ---------- named checklists ----------

/** Named checklists of the work item ("Aprovação", "Entrega"…), in order. */
export const useIssueNamedChecklists = (workspaceSlug: string, projectId: string, issueId: string) =>
  useSWR(workspaceSlug && projectId && issueId ? getIssueNamedChecklistsKey(issueId) : null, () =>
    issueChecklistService.listChecklists(workspaceSlug, projectId, issueId)
  );

/** A checklist created just now opens with its name ready to edit (the "Checklist" button). */
let pendingRenameChecklistId: string | null = null;
export const consumePendingChecklistRename = (id: string) => {
  if (pendingRenameChecklistId !== id) return false;
  pendingRenameChecklistId = null;
  return true;
};

export const useIssueNamedChecklistOperations = (workspaceSlug: string, projectId: string, issueId: string) => {
  const { t } = useTranslation();
  const { mutate } = useSWRConfig();
  const key = getIssueNamedChecklistsKey(issueId);
  const showError = () => setToast({ type: TOAST_TYPE.ERROR, title: t("issue_checklist.save_error") });

  const create = async (name: string) => {
    try {
      const created = await issueChecklistService.createChecklist(workspaceSlug, projectId, issueId, { name });
      pendingRenameChecklistId = created.id;
      await mutate<TIssueChecklist[]>(key, (current = []) => [...current, created], { revalidate: false });
      return created;
    } catch {
      showError();
      return undefined;
    }
  };

  const rename = async (id: string, name: string) => {
    await mutate<TIssueChecklist[]>(
      key,
      (current = []) => current.map((checklist) => (checklist.id === id ? { ...checklist, name } : checklist)),
      { revalidate: false }
    );
    try {
      await issueChecklistService.updateChecklist(workspaceSlug, projectId, issueId, id, { name });
    } catch {
      showError();
      await mutate(key);
    }
  };

  /** Removes the checklist and its lines. */
  const remove = async (id: string) => {
    await mutate<TIssueChecklist[]>(key, (current = []) => current.filter((checklist) => checklist.id !== id), {
      revalidate: false,
    });
    await mutate<TIssueChecklistItem[]>(
      getIssueChecklistKey(issueId),
      (current = []) => current.filter((item) => item.checklist !== id),
      { revalidate: false }
    );
    try {
      await issueChecklistService.removeChecklist(workspaceSlug, projectId, issueId, id);
    } catch {
      showError();
      await Promise.all([mutate(key), mutate(getIssueChecklistKey(issueId))]);
    }
  };

  return { create, rename, remove };
};
