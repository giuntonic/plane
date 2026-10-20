/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueChecklistItem, TIssueChecklistItemPayload } from "@plane/types";
import {
  getChecklistChildren as getChildren,
  getChecklistSortOrderBetween as sortOrderBetween,
  getChecklistSubtreeIds as getSubtreeIds,
} from "@plane/utils";
// services
import { issueChecklistService } from "@/services/issue-checklist.service";
// local imports
import { queueChecklistFocus } from "./context";

export const getIssueChecklistKey = (issueId: string) => `ISSUE_CHECKLIST_ITEMS_${issueId}`;

// ---------- data + operations ----------

/** Checklist lines of a work item. Shared SWR key, so the header count, the action button and the list stay in sync. */
export const useIssueChecklistItems = (workspaceSlug: string, projectId: string, issueId: string) =>
  useSWR(workspaceSlug && projectId && issueId ? getIssueChecklistKey(issueId) : null, () =>
    issueChecklistService.list(workspaceSlug, projectId, issueId)
  );

export type TChecklistOperations = ReturnType<typeof useIssueChecklistOperations>;

export const useIssueChecklistOperations = (workspaceSlug: string, projectId: string, issueId: string) => {
  const { t } = useTranslation();
  const { data: items = [], mutate } = useIssueChecklistItems(workspaceSlug, projectId, issueId);

  const showError = () => setToast({ type: TOAST_TYPE.ERROR, title: t("issue_checklist.save_error") });

  /** Creates a line; the new line takes the cursor as soon as it shows up. */
  const create = async (payload: TIssueChecklistItemPayload): Promise<TIssueChecklistItem | undefined> => {
    try {
      const created = await issueChecklistService.create(workspaceSlug, projectId, issueId, payload);
      queueChecklistFocus(created.id);
      await mutate((current = []) => [...current, created], { revalidate: false });
      return created;
    } catch {
      showError();
      return undefined;
    }
  };

  /** Optimistic: the line changes on screen right away and goes back if the request fails. */
  const update = async (id: string, payload: TIssueChecklistItemPayload) => {
    await mutate(
      async (current = []) => {
        const updated = await issueChecklistService.update(workspaceSlug, projectId, issueId, id, payload);
        return current.map((item) => (item.id === id ? updated : item));
      },
      {
        optimisticData: (current = []) => current.map((item) => (item.id === id ? { ...item, ...payload } : item)),
        rollbackOnError: true,
        revalidate: false,
      }
    ).catch(showError);
  };

  /** Removes the line and its sublists. */
  const remove = async (id: string) => {
    const removedIds = getSubtreeIds(items, id);
    await mutate(
      async (current = []) => {
        await issueChecklistService.remove(workspaceSlug, projectId, issueId, id);
        return current.filter((item) => !removedIds.has(item.id));
      },
      {
        optimisticData: (current = []) => current.filter((item) => !removedIds.has(item.id)),
        rollbackOnError: true,
        revalidate: false,
      }
    ).catch(showError);
  };

  const siblingsOf = (item: TIssueChecklistItem) => getChildren(items, item.parent);

  /** New empty line right below `item`, at the same level. */
  const createAfter = (item: TIssueChecklistItem) => {
    const siblings = siblingsOf(item);
    const next = siblings[siblings.indexOf(item) + 1];
    return create({ parent: item.parent, name: "", sort_order: sortOrderBetween(item, next) });
  };

  /** New empty line at the end of `parentId`'s sublist (null = end of the checklist). */
  const createAtEnd = (parentId: string | null, name = "") => {
    const siblings = getChildren(items, parentId);
    return create({ parent: parentId, name, sort_order: sortOrderBetween(siblings[siblings.length - 1]) });
  };

  /** Tab: the line becomes the last item of the sublist of the line above it. Returns the new parent id. */
  const indent = async (item: TIssueChecklistItem) => {
    const siblings = siblingsOf(item);
    const previous = siblings[siblings.indexOf(item) - 1];
    if (!previous) return undefined;
    const previousChildren = getChildren(items, previous.id);
    await update(item.id, {
      parent: previous.id,
      sort_order: sortOrderBetween(previousChildren[previousChildren.length - 1]),
    });
    return previous.id;
  };

  /** Shift+Tab: the line leaves its sublist and goes right below its parent. */
  const outdent = async (item: TIssueChecklistItem) => {
    const parent = items.find((candidate) => candidate.id === item.parent);
    if (!parent) return;
    const parentSiblings = siblingsOf(parent);
    const next = parentSiblings[parentSiblings.indexOf(parent) + 1];
    await update(item.id, { parent: parent.parent, sort_order: sortOrderBetween(parent, next) });
  };

  /** Alt+↑ / Alt+↓: swaps places with the neighbour at the same level. */
  const move = async (item: TIssueChecklistItem, direction: "up" | "down") => {
    const siblings = siblingsOf(item);
    const index = siblings.indexOf(item);
    const sortOrder =
      direction === "up"
        ? index > 0
          ? sortOrderBetween(siblings[index - 2], siblings[index - 1])
          : undefined
        : index < siblings.length - 1
          ? sortOrderBetween(siblings[index + 1], siblings[index + 2])
          : undefined;
    if (sortOrder === undefined) return;
    await update(item.id, { sort_order: sortOrder });
  };

  /** Drag and drop: `sourceId` goes right above/below `targetId`, at the target's level. */
  const drop = async (sourceId: string, targetId: string, edge: "top" | "bottom") => {
    const target = items.find((item) => item.id === targetId);
    if (!target || getSubtreeIds(items, sourceId).has(targetId)) return;
    const siblings = getChildren(items, target.parent).filter((item) => item.id !== sourceId);
    const index = siblings.indexOf(target);
    const sortOrder =
      edge === "top" ? sortOrderBetween(siblings[index - 1], target) : sortOrderBetween(target, siblings[index + 1]);
    await update(sourceId, { parent: target.parent, sort_order: sortOrder });
  };

  return { items, create, update, remove, createAfter, createAtEnd, indent, outdent, move, drop };
};
