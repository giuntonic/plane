/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: helpers da árvore de subtarefas leves (checklist) de um item de trabalho.
import type { TIssueChecklistItem } from "@plane/types";

type TChecklistTreeItem = Pick<TIssueChecklistItem, "id" | "parent" | "sort_order" | "created_at" | "is_completed">;

const DEFAULT_SORT_ORDER = 65535;
const SORT_ORDER_STEP = 10000;

const compareChecklistItems = (a: TChecklistTreeItem, b: TChecklistTreeItem) =>
  a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

/** Direct children of `parentId` (null = root), in display order. */
export const getChecklistChildren = <T extends TChecklistTreeItem>(items: T[], parentId: string | null): T[] =>
  items.filter((item) => item.parent === parentId).sort(compareChecklistItems);

/** `itemId` and every line below it in the tree. */
export const getChecklistSubtreeIds = (items: TChecklistTreeItem[], itemId: string): Set<string> => {
  const ids = new Set([itemId]);
  let added = true;
  while (added) {
    added = false;
    for (const item of items) {
      if (item.parent && ids.has(item.parent) && !ids.has(item.id)) {
        ids.add(item.id);
        added = true;
      }
    }
  }
  return ids;
};

/** Visible lines in reading order (depth-first), skipping the children of collapsed lines. */
export const getChecklistVisibleOrder = (items: TChecklistTreeItem[], collapsedIds: Set<string>): string[] => {
  const order: string[] = [];
  const walk = (parentId: string | null) => {
    for (const child of getChecklistChildren(items, parentId)) {
      order.push(child.id);
      if (!collapsedIds.has(child.id)) walk(child.id);
    }
  };
  walk(null);
  return order;
};

/** A sort_order between two neighbours (either may be missing). */
export const getChecklistSortOrderBetween = (
  before?: Pick<TChecklistTreeItem, "sort_order">,
  after?: Pick<TChecklistTreeItem, "sort_order">
) => {
  if (before && after) return (before.sort_order + after.sort_order) / 2;
  if (before) return before.sort_order + SORT_ORDER_STEP;
  if (after) return after.sort_order - SORT_ORDER_STEP;
  return DEFAULT_SORT_ORDER;
};

export const countCompletedChecklistItems = (items: Pick<TChecklistTreeItem, "is_completed">[]) =>
  items.filter((item) => item.is_completed).length;
