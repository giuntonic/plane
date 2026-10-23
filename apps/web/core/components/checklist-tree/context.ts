/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
// local imports
import type { TChecklistTreeLabels, TChecklistTreeNode, TChecklistTreeOperations } from "./types";

export type TCaretPosition = "start" | "end";

export type TChecklistTreeContext = {
  /** Drag and drop only moves lines inside the same list (a work item, the home "Tarefas" widget…). */
  scopeId: string;
  disabled: boolean;
  operations: TChecklistTreeOperations;
  labels: TChecklistTreeLabels;
  /** Extra controls shown on each line, before the "add to sublist / delete" buttons (assignee, due date…). */
  renderItemExtras?: (item: TChecklistTreeNode) => ReactNode;
  /** Lines in reading order, without the children of collapsed lines (for ↑/↓ and Backspace). */
  visibleOrder: string[];
  collapsedIds: Set<string>;
  toggleCollapsed: (id: string, collapsed?: boolean) => void;
  /** Each line registers its text field so another line can move the cursor to it. */
  registerInput: (id: string, element: HTMLTextAreaElement | null) => void;
  /** Focuses the line now, or as soon as it mounts (a new line, or one that moved in the tree). */
  focusItem: (id: string, caret?: TCaretPosition) => void;
  consumePendingFocus: (id: string) => TCaretPosition | undefined;
};

/** A line created from outside the list (an action button) takes focus as soon as it mounts. */
let externalPendingFocusId: string | null = null;
export const queueChecklistFocus = (id: string) => {
  externalPendingFocusId = id;
};
export const consumeExternalChecklistFocus = (id: string) => {
  if (externalPendingFocusId !== id) return false;
  externalPendingFocusId = null;
  return true;
};

export const ChecklistTreeContext = createContext<TChecklistTreeContext | null>(null);

export const useChecklistTreeContext = () => {
  const context = useContext(ChecklistTreeContext);
  if (!context) throw new Error("useChecklistTreeContext must be used inside ChecklistTreeContext");
  return context;
};
