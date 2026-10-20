/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Plus } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { getChecklistChildren, getChecklistVisibleOrder } from "@plane/utils";
// local imports
import type { TCaretPosition, TChecklistContext } from "./context";
import { ChecklistContext, consumeExternalChecklistFocus } from "./context";
import { useIssueChecklistOperations } from "./helper";
import { IssueChecklistItemRow } from "./item";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

export const IssueChecklistCollapsibleContent = observer(function IssueChecklistCollapsibleContent(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const { t } = useTranslation();
  const operations = useIssueChecklistOperations(workspaceSlug, projectId, issueId);
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

  const contextValue: TChecklistContext = {
    issueId,
    projectId,
    disabled,
    operations,
    visibleOrder,
    collapsedIds,
    toggleCollapsed,
    registerInput,
    focusItem,
    consumePendingFocus,
  };

  const handleAddAtEnd = () => void operations.createAtEnd(null);

  return (
    <ChecklistContext.Provider value={contextValue}>
      <div className="flex flex-col gap-1 px-1.5 pb-2">
        {rootItems.length > 0 && (
          <ul className="flex flex-col">
            {rootItems.map((item) => (
              <IssueChecklistItemRow key={item.id} item={item} />
            ))}
          </ul>
        )}
        {!disabled && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={handleAddAtEnd}
              className="flex items-center gap-1.5 rounded-sm px-1 py-1 text-body-sm-regular text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            >
              <Plus className="size-3.5" />
              {t("issue_checklist.add_line")}
            </button>
            {rootItems.length > 0 && (
              <span className="text-caption-sm-regular text-placeholder">{t("issue_checklist.hint")}</span>
            )}
          </div>
        )}
      </div>
    </ChecklistContext.Provider>
  );
});
