/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import type {
  DropTargetRecord,
  DragLocationHistory,
} from "@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types";
import type { ElementDragPayload } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { attachInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import { observer } from "mobx-react";
import { createRoot } from "react-dom/client";
// plane imports
import type { InstructionType, THomeWidgetKeys } from "@plane/types";
import { DropIndicator } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useHome } from "@/hooks/store/use-home";
// local imports
import { WidgetItemDragHandle } from "./manage/widget-item-drag-handle";
import { getCanDrop, getInstructionFromPayload } from "./manage/widget.helpers";

type Props = {
  widgetKey: THomeWidgetKeys;
  fullWidth: boolean;
  isLastChild: boolean;
  handleDrop: (self: DropTargetRecord, source: ElementDragPayload, location: DragLocationHistory) => void;
  children: React.ReactNode;
};

export const DashboardWidgetBlock = observer(function DashboardWidgetBlock(props: Props) {
  const { widgetKey, fullWidth, isLastChild, handleDrop, children } = props;
  // state
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState<InstructionType | undefined>(undefined);
  // ref
  const elementRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  // hooks
  const { widgetsMap } = useHome();
  const widget = widgetsMap[widgetKey];

  useEffect(() => {
    const element = elementRef.current;
    const dragHandle = dragHandleRef.current;

    if (!element || !dragHandle) return;
    const initialData = { id: widgetKey, isGroup: false };
    return combine(
      draggable({
        element,
        dragHandle,
        getInitialData: () => initialData,
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
        onGenerateDragPreview: ({ nativeSetDragImage }) => {
          setCustomNativeDragPreview({
            getOffset: pointerOutsideOfPreview({ x: "0px", y: "0px" }),
            render: ({ container }) => {
              const root = createRoot(container);
              root.render(<div className="rounded-sm bg-surface-1 p-1 pr-2 text-13">{widgetKey}</div>);
              return () => root.unmount();
            },
            nativeSetDragImage,
          });
        },
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => getCanDrop(source, widget),
        onDragStart: () => setIsDragging(true),
        getData: ({ input, element: dropElement }) => {
          const blockedStates: InstructionType[] = ["make-child"];
          if (!isLastChild) blockedStates.push("reorder-below");

          return attachInstruction(initialData, {
            input,
            element: dropElement,
            currentLevel: 1,
            indentPerLevel: 0,
            mode: isLastChild ? "last-in-group" : "standard",
            block: blockedStates,
          });
        },
        onDrag: ({ self, source, location }) => {
          setInstruction(getInstructionFromPayload(self, source, location));
        },
        onDragLeave: () => setInstruction(undefined),
        onDrop: ({ self, source, location }) => {
          setInstruction(undefined);
          handleDrop(self, source, location);
        },
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementRef?.current, dragHandleRef?.current, isDragging, isLastChild, widgetKey]);

  return (
    <div className={cn("relative", { "col-span-2": fullWidth })}>
      <DropIndicator isVisible={instruction === "reorder-above"} />
      <div
        ref={elementRef}
        className={cn("group/dashboard-block rounded-lg border border-subtle bg-surface-1 p-4 pt-2 transition-colors", {
          "border-accent-strong": isDragging,
        })}
      >
        <div
          ref={dragHandleRef}
          className={cn(
            "-mx-1 mb-1 flex h-3 items-center justify-center rounded-sm opacity-0 group-hover/dashboard-block:opacity-100",
            { "cursor-grabbing": isDragging }
          )}
        >
          <WidgetItemDragHandle sort_order={widget?.sort_order ?? null} isDragging={isDragging} />
        </div>
        {children}
      </div>
      {isLastChild && <DropIndicator isVisible={instruction === "reorder-below"} />}
    </div>
  );
});
