/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachClosestEdge, extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { observer } from "mobx-react";
import { Check, ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
// plane imports
import { Tooltip } from "@plane/propel/tooltip";
import { DropIndicator } from "@plane/ui";
import { cn, countCompletedChecklistItems, getChecklistChildren, getChecklistSubtreeIds } from "@plane/utils";
// local imports
import { useChecklistTreeContext } from "./context";
import type { TChecklistTreeNode } from "./types";

const SAVE_DEBOUNCE_MS = 700;
const DRAG_TYPE = "pespo-checklist-item";

type TDragData = { type: typeof DRAG_TYPE; id: string; scopeId: string };

const isDragData = (data: Record<string | symbol, unknown>): data is TDragData => data.type === DRAG_TYPE;

type Props = {
  item: TChecklistTreeNode;
};

export const ChecklistTreeItem = observer(function ChecklistTreeItem(props: Props) {
  const { item } = props;
  const {
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
  } = useChecklistTreeContext();
  // refs
  const rowRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // states
  const [draft, setDraft] = useState(item.name);
  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<"top" | "bottom" | null>(null);
  // derived values
  const children = getChecklistChildren(operations.items, item.id);
  const hasChildren = children.length > 0;
  const isCollapsed = collapsedIds.has(item.id);

  // keep the text in sync with the server while the line isn't being edited
  useEffect(() => {
    if (!isFocused) setDraft(item.name);
  }, [item.name, isFocused]);

  // grow the text field with its content (lines wrap like in Notion)
  useLayoutEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);

  // register the text field and take focus if another line asked for it before this one mounted
  useEffect(() => {
    registerInput(item.id, inputRef.current);
    const caret = consumePendingFocus(item.id);
    if (caret && inputRef.current) {
      const position = caret === "start" ? 0 : inputRef.current.value.length;
      inputRef.current.focus();
      inputRef.current.setSelectionRange(position, position);
    }
    return () => registerInput(item.id, null);
  }, [item.id, registerInput, consumePendingFocus]);

  const saveName = useCallback(
    (value: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      if (value !== item.name) void operations.update(item.id, { name: value });
    },
    [item.id, item.name, operations]
  );

  useEffect(
    () => () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    },
    []
  );

  // drag and drop (handle on the left, drop above/below any line of the same list)
  useEffect(() => {
    const element = rowRef.current;
    const dragHandle = handleRef.current;
    if (!element || !dragHandle || disabled) return;
    const data: TDragData = { type: DRAG_TYPE, id: item.id, scopeId };
    return combine(
      draggable({
        element,
        dragHandle,
        getInitialData: () => data,
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) =>
          isDragData(source.data) &&
          source.data.scopeId === scopeId &&
          !getChecklistSubtreeIds(operations.items, source.data.id).has(item.id),
        getData: ({ input, element: target }) =>
          attachClosestEdge(data, { input, element: target, allowedEdges: ["top", "bottom"] }),
        onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data) as "top" | "bottom" | null),
        onDragLeave: () => setClosestEdge(null),
        onDrop: ({ self, source }) => {
          setClosestEdge(null);
          const edge = extractClosestEdge(self.data) as "top" | "bottom" | null;
          if (!edge || !isDragData(source.data)) return;
          void operations.drop(source.data.id, item.id, edge);
        },
      })
    );
  }, [disabled, scopeId, item.id, operations]);

  const focusNeighbour = (offset: -1 | 1, caret: "start" | "end") => {
    const index = visibleOrder.indexOf(item.id);
    const neighbour = visibleOrder[index + offset];
    if (neighbour) focusItem(neighbour, caret);
    return !!neighbour;
  };

  const handleKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    const caretAtStart = element.selectionStart === 0 && element.selectionEnd === 0;
    const caretAtEnd = element.selectionStart === element.value.length;

    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      saveName(draft);
      await operations.createAfter(item);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      saveName(draft);
      if (event.shiftKey) await operations.outdent(item);
      else {
        const newParentId = await operations.indent(item);
        if (newParentId) toggleCollapsed(newParentId, false);
      }
      focusItem(item.id, "end");
      return;
    }
    if (event.key === "Backspace" && draft === "" && !hasChildren) {
      event.preventDefault();
      if (!focusNeighbour(-1, "end")) focusNeighbour(1, "start");
      await operations.remove(item.id);
      return;
    }
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && event.altKey) {
      event.preventDefault();
      saveName(draft);
      await operations.move(item, event.key === "ArrowUp" ? "up" : "down");
      focusItem(item.id, "end");
      return;
    }
    if (event.key === "ArrowUp" && caretAtStart && focusNeighbour(-1, "end")) event.preventDefault();
    if (event.key === "ArrowDown" && caretAtEnd && focusNeighbour(1, "start")) event.preventDefault();
  };

  const actionClassName =
    "grid size-6 flex-shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-primary";

  return (
    <li className="relative">
      <DropIndicator isVisible={closestEdge === "top"} />
      <div
        ref={rowRef}
        className={cn(
          "group/checklist-row flex items-start gap-1 rounded-md px-1 py-0.5 hover:bg-layer-transparent-hover",
          {
            "opacity-50": isDragging,
            "bg-layer-transparent-hover": isFocused,
          }
        )}
      >
        {/* drag handle */}
        <Tooltip tooltipContent={labels.drag} disabled={disabled}>
          <button
            ref={handleRef}
            type="button"
            tabIndex={-1}
            className={cn(
              "mt-0.5 grid size-5 flex-shrink-0 cursor-grab place-items-center rounded-sm text-placeholder opacity-0 group-hover/checklist-row:opacity-100",
              { hidden: disabled }
            )}
            aria-label={labels.drag}
          >
            <GripVertical className="size-3.5" />
          </button>
        </Tooltip>
        {/* expand / collapse a sublist */}
        <button
          type="button"
          tabIndex={-1}
          className={cn("mt-0.5 grid size-5 flex-shrink-0 place-items-center rounded-sm text-tertiary", {
            invisible: !hasChildren,
          })}
          onClick={() => toggleCollapsed(item.id)}
          aria-label={isCollapsed ? labels.expand : labels.collapse}
        >
          <ChevronRight className={cn("size-3.5 transition-transform", { "rotate-90": !isCollapsed })} />
        </button>
        {/* checkbox */}
        <span className="relative mt-1 grid size-4 flex-shrink-0 place-items-center">
          <input
            type="checkbox"
            checked={item.is_completed}
            disabled={disabled}
            aria-label={draft || labels.placeholder}
            onChange={() => void operations.update(item.id, { is_completed: !item.is_completed })}
            className={cn(
              "size-4 cursor-pointer appearance-none rounded-sm border border-strong transition-colors checked:border-accent-strong checked:bg-accent-primary disabled:cursor-default",
              { "hover:border-accent-strong": !item.is_completed && !disabled }
            )}
          />
          {item.is_completed && <Check className="pointer-events-none absolute size-3 text-on-color" strokeWidth={3} />}
        </span>
        {/* text */}
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          readOnly={disabled}
          placeholder={labels.placeholder}
          onChange={(event) => {
            const { value } = event.target;
            setDraft(value);
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(() => saveName(value), SAVE_DEBOUNCE_MS);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            saveName(draft);
          }}
          onKeyDown={(event) => void handleKeyDown(event)}
          className={cn(
            "min-w-0 flex-1 resize-none overflow-hidden border-none bg-transparent px-1 py-0.5 text-body-sm-regular text-primary outline-none placeholder:text-placeholder",
            { "text-tertiary line-through": item.is_completed }
          )}
        />
        {/* Everything right of the text sits in one box as tall as the first line of text, so the controls
            (each with its own height) line up with it and with each other. */}
        <div className="flex h-6 flex-shrink-0 items-center gap-0.5">
          {/* progress of the sublist */}
          {hasChildren && (
            <span className="flex-shrink-0 text-caption-sm-regular text-tertiary">
              {countCompletedChecklistItems(children)}/{children.length}
            </span>
          )}
          {renderItemExtras?.(item)}
          {/* add to sublist / delete */}
          {!disabled && (
            <div className="flex flex-shrink-0 items-center opacity-0 group-hover/checklist-row:opacity-100 focus-within:opacity-100">
              <Tooltip tooltipContent={labels.addChild}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={actionClassName}
                  onClick={async () => {
                    toggleCollapsed(item.id, false);
                    await operations.createAtEnd(item.id);
                  }}
                >
                  <Plus className="size-3.5" />
                </button>
              </Tooltip>
              <Tooltip tooltipContent={labels.delete}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={cn(actionClassName, "hover:text-danger-primary")}
                  onClick={() => void operations.remove(item.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
      <DropIndicator isVisible={closestEdge === "bottom"} />
      {/* sublist */}
      {hasChildren && !isCollapsed && (
        <ul className="ml-[2.375rem] border-l border-subtle pl-1">
          {children.map((child) => (
            <ChecklistTreeItem key={child.id} item={child} />
          ))}
        </ul>
      )}
    </li>
  );
});
