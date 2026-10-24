/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR, { useSWRConfig } from "swr";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import {
  getChecklistChildren as getChildren,
  getChecklistSortOrderBetween as sortOrderBetween,
  getChecklistSubtreeIds as getSubtreeIds,
} from "@plane/utils";
// local imports
import { queueChecklistFocus } from "./context";
import type { TChecklistTreeNode, TChecklistTreeNodePayload, TChecklistTreeOperations } from "./types";

export type TChecklistTreeSource<T extends TChecklistTreeNode, P extends TChecklistTreeNodePayload> = {
  /** SWR key of the list (null while the list can't be fetched yet). Shared, so every reader stays in sync. */
  key: string | null;
  list: () => Promise<T[]>;
  create: (payload: P) => Promise<T>;
  update: (id: string, payload: P) => Promise<T>;
  remove: (id: string) => Promise<void>;
  /** Fields the server always recomputes on update (completed_at, updated_at…), copied from the response. */
  serverFields?: (keyof T)[];
  errorMessage: string;
  /**
   * Pespo: one list among several sharing the same SWR key (the named checklists of a work item). The
   * operations only see the lines that pass `filter`, so siblings, Tab and Alt+↑/↓ stay inside the list,
   * and new lines get `payload` (e.g. `{ checklist: id }`). Lines move between lists only through `update`.
   */
  scope?: { filter: (item: T) => boolean; payload: Partial<P> };
};

/**
 * Requests that change the same line go out one after the other, never overlapping. The server
 * also saves only the fields each PATCH sends, but a later request must not reach it before an
 * earlier one (the last text typed has to win). Shared by every list using the same SWR key.
 */
const lineQueues = new Map<string, Promise<unknown>>();
const enqueueLineRequest = <R>(queueKey: string, run: () => Promise<R>): Promise<R> => {
  const previous = lineQueues.get(queueKey) ?? Promise.resolve();
  const next = previous.then(run, run);
  lineQueues.set(queueKey, next);
  const cleanup = () => {
    if (lineQueues.get(queueKey) === next) lineQueues.delete(queueKey);
  };
  next.then(cleanup, cleanup);
  return next;
};

export const useChecklistTreeItems = <T extends TChecklistTreeNode, P extends TChecklistTreeNodePayload>(
  source: Pick<TChecklistTreeSource<T, P>, "key" | "list">
) => useSWR(source.key, () => source.list());

export const useChecklistTreeOperations = <T extends TChecklistTreeNode, P extends TChecklistTreeNodePayload>(
  source: TChecklistTreeSource<T, P>
): TChecklistTreeOperations<T, P> => {
  const { key, serverFields = [], errorMessage, scope } = source;
  const { data: allItems = [], mutate } = useChecklistTreeItems<T, P>(source);
  const items = scope ? allItems.filter(scope.filter) : allItems;
  const { mutate: mutateKey } = useSWRConfig();

  const showError = () => setToast({ type: TOAST_TYPE.ERROR, title: errorMessage });

  /** Creates a line; the new line takes the cursor as soon as it shows up. */
  const create = async (payload: P): Promise<T | undefined> => {
    try {
      const created = await source.create(scope ? ({ ...scope.payload, ...payload } as P) : payload);
      queueChecklistFocus(created.id);
      await mutate((current = []) => [...current, created], { revalidate: false });
      return created;
    } catch {
      showError();
      return undefined;
    }
  };

  // Every cache write is a synchronous function over what is on screen. Tab/Enter save the text and
  // then move the line — two PATCHes in a row. With SWR's optimisticData the second one is computed
  // from the data committed *before* the first, and SWR drops the older result, so the text vanished
  // from the screen. On a failed request the list is fetched again instead of rolled back.

  /** Optimistic: the line changes on screen right away; the server only adds the fields it computes. */
  const update = async (id: string, payload: P) => {
    if (!key) return;
    const patch = (fields: object) =>
      mutateKey<T[]>(
        key,
        (current = []) => current.map((item) => (item.id === id ? ({ ...item, ...fields } as T) : item)),
        { revalidate: false }
      );
    await patch(payload);
    try {
      const updated = await enqueueLineRequest(`${key}:${id}`, () => source.update(id, payload));
      if (serverFields.length) await patch(Object.fromEntries(serverFields.map((field) => [field, updated[field]])));
    } catch {
      showError();
      await mutateKey(key);
    }
  };

  /** Removes the line and its sublists. */
  const remove = async (id: string) => {
    const removedIds = getSubtreeIds(items, id);
    await mutate((current = []) => current.filter((item) => !removedIds.has(item.id)), { revalidate: false });
    try {
      await enqueueLineRequest(`${key}:${id}`, () => source.remove(id));
    } catch {
      showError();
      await mutate();
    }
  };

  const siblingsOf = (item: T) => getChildren(items, item.parent);

  const createAfter = (item: T) => {
    const siblings = siblingsOf(item);
    const next = siblings[siblings.indexOf(item) + 1];
    return create({ parent: item.parent, name: "", sort_order: sortOrderBetween(item, next) } as P);
  };

  const createAtEnd = (parentId: string | null, name = "") => {
    const siblings = getChildren(items, parentId);
    return create({ parent: parentId, name, sort_order: sortOrderBetween(siblings[siblings.length - 1]) } as P);
  };

  const indent = async (item: T) => {
    const siblings = siblingsOf(item);
    const previous = siblings[siblings.indexOf(item) - 1];
    if (!previous) return undefined;
    const previousChildren = getChildren(items, previous.id);
    await update(item.id, {
      parent: previous.id,
      sort_order: sortOrderBetween(previousChildren[previousChildren.length - 1]),
    } as P);
    return previous.id;
  };

  const outdent = async (item: T) => {
    const parent = items.find((candidate) => candidate.id === item.parent);
    if (!parent) return;
    const parentSiblings = siblingsOf(parent);
    const next = parentSiblings[parentSiblings.indexOf(parent) + 1];
    await update(item.id, { parent: parent.parent, sort_order: sortOrderBetween(parent, next) } as P);
  };

  const move = async (item: T, direction: "up" | "down") => {
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
    await update(item.id, { sort_order: sortOrder } as P);
  };

  const drop = async (sourceId: string, targetId: string, edge: "top" | "bottom") => {
    const target = items.find((item) => item.id === targetId);
    if (!target || getSubtreeIds(items, sourceId).has(targetId)) return;
    const siblings = getChildren(items, target.parent).filter((item) => item.id !== sourceId);
    const index = siblings.indexOf(target);
    const sortOrder =
      edge === "top" ? sortOrderBetween(siblings[index - 1], target) : sortOrderBetween(target, siblings[index + 1]);
    await update(sourceId, { parent: target.parent, sort_order: sortOrder } as P);
  };

  return { items, create, update, remove, createAfter, createAtEnd, indent, outdent, move, drop };
};
