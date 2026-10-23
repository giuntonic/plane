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
import { Check, EyeOff, MoreHorizontal } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { InstructionType, THomeWidgetConfig, THomeWidgetKeys } from "@plane/types";
import { CustomMenu, DropIndicator } from "@plane/ui";
import { HOME_GRID_COLUMNS, cn, getHomeWidgetHeight, getHomeWidgetWidth, getResizedHomeWidgetSize } from "@plane/utils";
// hooks
import { useHome } from "@/hooks/store/use-home";
// local imports
import { WidgetItemDragHandle } from "./manage/widget-item-drag-handle";
import { getCanDrop, getInstructionFromPayload } from "./manage/widget.helpers";

// Tailwind only ships classes it can see written out, so the spans can't be built from the number.
const WIDTH_CLASSNAMES: Record<number, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
};

const WIDTH_OPTIONS = [
  { width: 1, labelKey: "home.widget.width_quarter" },
  { width: 2, labelKey: "home.widget.width_half" },
  { width: 3, labelKey: "home.widget.width_three_quarters" },
  { width: 4, labelKey: "home.widget.width_full" },
] as const;

type Props = {
  workspaceSlug: string;
  widgetKey: THomeWidgetKeys;
  title: string;
  defaultWidth: number;
  isLastChild: boolean;
  handleDrop: (self: DropTargetRecord, source: ElementDragPayload, location: DragLocationHistory) => void;
  children: React.ReactNode;
};

type TResizeState = {
  startX: number;
  startY: number;
  start: Parameters<typeof getResizedHomeWidgetSize>[0];
};

export const DashboardWidgetBlock = observer(function DashboardWidgetBlock(props: Props) {
  const { workspaceSlug, widgetKey, title, defaultWidth, isLastChild, handleDrop, children } = props;
  const { t } = useTranslation();
  // state
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState<InstructionType | undefined>(undefined);
  /** Size shown while the resize handle is being dragged (saved on release). */
  const [preview, setPreview] = useState<{ w: number; h: number } | null>(null);
  // ref
  const elementRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<TResizeState | null>(null);
  // hooks
  const { widgetsMap, toggleWidget, updateWidgetConfig } = useHome();
  const widget = widgetsMap[widgetKey];
  const config: THomeWidgetConfig = widget?.config ?? {};
  // derived values
  const width = preview?.w ?? getHomeWidgetWidth(config.w, defaultWidth);
  const height = preview?.h ?? getHomeWidgetHeight(config.h);

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
              root.render(<div className="rounded-sm bg-surface-1 p-1 pr-2 text-13">{title}</div>);
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
  }, [elementRef?.current, dragHandleRef?.current, isDragging, isLastChild, widgetKey, title]);

  const saveConfig = (next: THomeWidgetConfig) => {
    updateWidgetConfig(workspaceSlug, widgetKey, next).catch(() =>
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("home.widget.resize_failed") })
    );
  };

  const handleRemove = () => {
    toggleWidget(workspaceSlug, widgetKey, false).catch(() =>
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("home.widget.remove_failed") })
    );
  };

  // ---------- resize handle (bottom right): width snaps to columns, height to 20px steps ----------

  const handleResizeStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    const card = elementRef.current;
    const grid = card?.closest<HTMLElement>("[data-home-grid]");
    if (!card || !grid) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const gridStyle = window.getComputedStyle(grid);
    const columns = gridStyle.gridTemplateColumns.split(" ").filter(Boolean).length || HOME_GRID_COLUMNS;
    const gap = parseFloat(gridStyle.columnGap) || 0;
    const columnWidth = (grid.clientWidth - gap * (columns - 1)) / columns;
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      start: { width: card.offsetWidth, height: card.offsetHeight, columnWidth, gap, columns },
    };
    setPreview(getResizedHomeWidgetSize(resizeRef.current.start, 0, 0));
  };

  const handleResizeMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current;
    if (!resize) return;
    setPreview(getResizedHomeWidgetSize(resize.start, event.clientX - resize.startX, event.clientY - resize.startY));
  };

  const handleResizeEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current;
    resizeRef.current = null;
    if (!resize) return;
    const next = getResizedHomeWidgetSize(resize.start, event.clientX - resize.startX, event.clientY - resize.startY);
    setPreview(null);
    const moved = Math.abs(event.clientX - resize.startX) > 2 || Math.abs(event.clientY - resize.startY) > 2;
    if (moved) saveConfig({ ...config, w: next.w, h: next.h });
  };

  const handleResetHeight = () => {
    const next = { ...config };
    delete next.h;
    saveConfig(next);
  };

  return (
    <div className={cn("relative min-w-0", WIDTH_CLASSNAMES[width])}>
      <DropIndicator isVisible={instruction === "reorder-above"} />
      <div
        ref={elementRef}
        style={height ? { height } : undefined}
        className={cn(
          "group/dashboard-block relative flex flex-col rounded-lg border border-subtle bg-surface-1 p-4 pt-1 transition-colors",
          {
            "border-accent-strong": isDragging || !!preview,
            "h-full": !height,
          }
        )}
      >
        {/* top bar: drag to reorder (middle), widget menu (right) */}
        <div className="-mx-1 mb-1 flex h-5 flex-shrink-0 items-center opacity-0 group-hover/dashboard-block:opacity-100 focus-within:opacity-100">
          <div className="w-6 flex-shrink-0" />
          <div
            ref={dragHandleRef}
            className={cn("flex h-full flex-1 items-center justify-center rounded-sm", {
              "cursor-grabbing": isDragging,
            })}
          >
            <WidgetItemDragHandle sort_order={widget?.sort_order ?? null} isDragging={isDragging} />
          </div>
          <CustomMenu
            customButton={
              <span className="grid size-6 place-items-center rounded-sm text-placeholder hover:bg-layer-1 hover:text-secondary">
                <MoreHorizontal className="size-4" />
              </span>
            }
            customButtonClassName="flex-shrink-0"
            ariaLabel={t("home.widget.options")}
            placement="bottom-end"
            closeOnSelect
          >
            <div className="px-1 py-1 text-caption-sm-medium text-placeholder">{t("home.widget.width")}</div>
            {WIDTH_OPTIONS.map((option) => (
              <CustomMenu.MenuItem
                key={option.width}
                onClick={() => saveConfig({ ...config, w: option.width })}
                className="flex items-center justify-between gap-2"
              >
                {t(option.labelKey)}
                {width === option.width && <Check className="size-3.5 text-accent-primary" />}
              </CustomMenu.MenuItem>
            ))}
            {config.h !== undefined && (
              <CustomMenu.MenuItem onClick={handleResetHeight}>{t("home.widget.auto_height")}</CustomMenu.MenuItem>
            )}
            <div className="my-1 border-t border-subtle" />
            <CustomMenu.MenuItem onClick={handleRemove} className="flex items-center gap-2">
              <EyeOff className="size-3.5" />
              {t("home.widget.remove")}
            </CustomMenu.MenuItem>
          </CustomMenu>
        </div>
        <div className={cn("min-h-0 flex-1", { "overflow-y-auto": !!height })}>{children}</div>
        {/* resize handle */}
        <button
          type="button"
          aria-label={t("home.widget.resize")}
          title={t("home.widget.resize_hint")}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          onDoubleClick={handleResetHeight}
          className={cn(
            "absolute right-0.5 bottom-0.5 hidden size-4 cursor-nwse-resize touch-none rounded-sm text-placeholder opacity-0 group-hover/dashboard-block:opacity-100 hover:text-secondary md:block",
            { "opacity-100": !!preview }
          )}
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M14 6 6 14M14 10l-4 4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {isLastChild && <DropIndicator isVisible={instruction === "reorder-below"} />}
    </div>
  );
});
