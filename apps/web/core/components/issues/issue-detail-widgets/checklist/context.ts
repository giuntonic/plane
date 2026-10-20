/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createContext, useContext } from "react";
// local imports
import type { TChecklistOperations } from "./helper";

export type TCaretPosition = "start" | "end";

export type TChecklistContext = {
  issueId: string;
  projectId: string;
  disabled: boolean;
  operations: TChecklistOperations;
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

/** A line created from outside the list (the "Subtarefa" action button) takes focus as soon as it mounts. */
let externalPendingFocusId: string | null = null;
export const queueChecklistFocus = (id: string) => {
  externalPendingFocusId = id;
};
export const consumeExternalChecklistFocus = (id: string) => {
  if (externalPendingFocusId !== id) return false;
  externalPendingFocusId = null;
  return true;
};

export const ChecklistContext = createContext<TChecklistContext | null>(null);

export const useChecklistContext = () => {
  const context = useContext(ChecklistContext);
  if (!context) throw new Error("useChecklistContext must be used inside ChecklistContext");
  return context;
};
