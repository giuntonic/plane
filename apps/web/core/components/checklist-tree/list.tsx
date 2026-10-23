/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { Plus } from "lucide-react";
// plane imports
import { cn, getChecklistChildren, getChecklistVisibleOrder } from "@plane/utils";
// local imports
import type { TCaretPosition, TChecklistTreeContext } from "./context";
import { ChecklistTreeContext, consumeExternalChecklistFocus } from "./context";
import { ChecklistTreeItem } from "./item";
import type { TChecklistTreeLabels, TChecklistTreeNode, TChecklistTreeOperations } from "./types";

type Props = {
  scopeId: string;
  disabled: boolean;
  operations: TChecklistTreeOperations;
  labels: TChecklistTreeLabels;
  renderItemExtras?: (item: TChecklistTreeNode) => ReactNode;
  /** Shown instead of the list when it has no lines. */
  emptyState?: ReactNode;
  className?: string;
};

export const ChecklistTreeList = observer(function ChecklistTreeList(props: Props) {
  const { scopeId, disabled, operations, labels, renderItemExtras, emptyState, className } = props;
  // states
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  // refs
  const inputsRef = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocusRef = useRef<{ id: string; caret: TCaretPosition } | null>(null);
  // derived values
  const rootItems = getChecklistChildren(operations.items, null);
  const visibleOrder = useMemo(
    () => getChecklistVisibleOrder(operations.items, collapsedIds),
    [operations.items, collapsedIds]
  );

  const toggleCollapsed = useCallback((id: string, collapsed?: boolean) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      const shouldCollapse = collapsed ?? !next.has(id);
      if (shouldCollapse) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const registerInput = useCallback((id: string, element: HTMLTextAreaElement | null) => {
    if (element) inputsRef.current.set(id, element);
    else inputsRef.current.delete(id);
  }, []);

  const focusItem = useCallback((id: string, caret: TCaretPosition = "end") => {
    const element = inputsRef.current.get(id);
    // the line may be about to (re)mount — a new line, or one that moved in the tree
    pendingFocusRef.current = { id, caret };
    if (!element) return;
    // wait a frame so a line that is moving in the tree doesn't take focus right before unmounting
    requestAnimationFrame(() => {
      const current = inputsRef.current.get(id);
      if (!current || pendingFocusRef.current?.id !== id) return;
      pendingFocusRef.current = null;
      const position = caret === "start" ? 0 : current.value.length;
      current.focus();
      current.setSelectionRange(position, position);
    });
  }, []);

  const consumePendingFocus = useCallback((id: string): TCaretPosition | undefined => {
    if (consumeExternalChecklistFocus(id)) return "start";
    if (pendingFocusRef.current?.id !== id) return undefined;
    const { caret } = pendingFocusRef.current;
    pendingFocusRef.current = null;
    return caret;
  }, []);

  const contextValue: TChecklistTreeContext = useMemo(
    () => ({
      scopeId,
      disabled,
      operations,
      labels,
      renderItemExtras,
      visibleOrder,
      collapsedIds,
      toggleCollapsed,
      registerInput,
      focusItem,
      consumePendingFocus,
    }),
    [
      scopeId,
      disabled,
      operations,
      labels,
      renderItemExtras,
      visibleOrder,
      collapsedIds,
      toggleCollapsed,
      registerInput,
      focusItem,
      consumePendingFocus,
    ]
  );

  const handleAddAtEnd = () => void operations.createAtEnd(null);

  return (
    <ChecklistTreeContext.Provider value={contextValue}>
      <div className={cn("flex flex-col gap-1", className)}>
        {rootItems.length > 0 ? (
          <ul className="flex flex-col">
            {rootItems.map((item) => (
              <ChecklistTreeItem key={item.id} item={item} />
            ))}
          </ul>
        ) : (
          emptyState
        )}
        {!disabled && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={handleAddAtEnd}
              className="flex items-center gap-1.5 rounded-sm px-1 py-1 text-body-sm-regular text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            >
              <Plus className="size-3.5" />
              {labels.addLine}
            </button>
            {rootItems.length > 0 && <span className="text-caption-sm-regular text-placeholder">{labels.hint}</span>}
          </div>
        )}
      </div>
    </ChecklistTreeContext.Provider>
  );
});
