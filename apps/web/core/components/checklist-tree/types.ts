/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: lista em árvore com checkbox (subtarefas leves dos itens de trabalho e o widget "Tarefas"
// da home). A lista é plana; `parent` monta a árvore e `sort_order` ordena as irmãs.

export type TChecklistTreeNode = {
  id: string;
  parent: string | null;
  name: string;
  is_completed: boolean;
  sort_order: number;
  created_at: string;
};

export type TChecklistTreeNodePayload = Partial<
  Pick<TChecklistTreeNode, "parent" | "name" | "is_completed" | "sort_order">
>;

/** Written as methods so a list of a richer node type (with assignee, due date…) fits where the base one is expected. */
export type TChecklistTreeOperations<
  T extends TChecklistTreeNode = TChecklistTreeNode,
  P extends TChecklistTreeNodePayload = TChecklistTreeNodePayload,
> = {
  items: T[];
  create(payload: P): Promise<T | undefined>;
  update(id: string, payload: P): Promise<void>;
  remove(id: string): Promise<void>;
  /** New empty line right below `item`, at the same level. */
  createAfter(item: T): Promise<T | undefined>;
  /** New line at the end of `parentId`'s sublist (null = end of the list). */
  createAtEnd(parentId: string | null, name?: string): Promise<T | undefined>;
  /** Tab: the line becomes the last item of the sublist of the line above it. Returns the new parent id. */
  indent(item: T): Promise<string | undefined>;
  /** Shift+Tab: the line leaves its sublist and goes right below its parent. */
  outdent(item: T): Promise<void>;
  /** Alt+↑ / Alt+↓: swaps places with the neighbour at the same level. */
  move(item: T, direction: "up" | "down"): Promise<void>;
  /** Drag and drop: `sourceId` goes right above/below `targetId`, at the target's level. */
  drop(sourceId: string, targetId: string, edge: "top" | "bottom"): Promise<void>;
};

export type TChecklistTreeLabels = {
  placeholder: string;
  addLine: string;
  addChild: string;
  delete: string;
  expand: string;
  collapse: string;
  drag: string;
  hint: string;
};
