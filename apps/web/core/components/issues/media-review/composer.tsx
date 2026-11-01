/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Eraser, MoveUpRight, Pencil, Square, Undo2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { Button, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
// local imports
import { DRAWING_COLORS } from "./helpers";
import type { TDrawingTool } from "./types";

type Props = {
  placeholder: string;
  /** "em 0:14" ou "no ponto marcado"; vazio enquanto não há posição (imagem sem ponto). */
  positionLabel: string | null;
  text: string;
  onTextChange: (text: string) => void;
  onFocus: () => void;
  drawTool: TDrawingTool | null;
  onDrawToolChange: (tool: TDrawingTool | null) => void;
  drawColor: string;
  onDrawColorChange: (color: string) => void;
  shapeCount: number;
  onUndo: () => void;
  onClearDrawing: () => void;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
};

const TOOLS: { tool: TDrawingTool; icon: typeof Pencil; label: string }[] = [
  { tool: "pen", icon: Pencil, label: "media_review.tool_pen" },
  { tool: "arrow", icon: MoveUpRight, label: "media_review.tool_arrow" },
  { tool: "rect", icon: Square, label: "media_review.tool_rect" },
];

export function ReviewComposer(props: Props) {
  const {
    placeholder,
    positionLabel,
    text,
    onTextChange,
    onFocus,
    drawTool,
    onDrawToolChange,
    drawColor,
    onDrawColorChange,
    shapeCount,
    onUndo,
    onClearDrawing,
    submitting,
    onSubmit,
    onCancel,
  } = props;
  const { t } = useTranslation();
  const hasContent = !!text.trim() || shapeCount > 0;
  const canSubmit = hasContent && !!positionLabel && !submitting;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-subtle bg-surface-1 p-2">
      <div className="flex flex-wrap items-center gap-1">
        {TOOLS.map(({ tool, icon: Icon, label }) => (
          <Tooltip key={tool} tooltipContent={t(label)} position="top">
            <button
              type="button"
              aria-label={t(label)}
              aria-pressed={drawTool === tool}
              onClick={() => onDrawToolChange(drawTool === tool ? null : tool)}
              className={cn(
                "grid size-7 place-items-center rounded-sm text-secondary hover:bg-layer-transparent-hover",
                drawTool === tool && "bg-accent-subtle text-accent-primary"
              )}
            >
              <Icon className="size-4" />
            </button>
          </Tooltip>
        ))}
        <div className="mx-1 h-5 w-px bg-layer-3" />
        {DRAWING_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={t("media_review.color", { color })}
            aria-pressed={drawColor === color}
            onClick={() => {
              onDrawColorChange(color);
              if (!drawTool) onDrawToolChange("pen");
            }}
            className={cn(
              "size-5 rounded-full border border-strong",
              drawColor === color && "ring-offset-surface-1 ring-2 ring-accent-strong ring-offset-1"
            )}
            style={{ background: color }}
          />
        ))}
        {shapeCount > 0 && (
          <>
            <div className="mx-1 h-5 w-px bg-layer-3" />
            <Tooltip tooltipContent={t("media_review.undo")} position="top">
              <button
                type="button"
                aria-label={t("media_review.undo")}
                onClick={onUndo}
                className="grid size-7 place-items-center rounded-sm text-secondary hover:bg-layer-transparent-hover"
              >
                <Undo2 className="size-4" />
              </button>
            </Tooltip>
            <Tooltip tooltipContent={t("media_review.clear_drawing")} position="top">
              <button
                type="button"
                aria-label={t("media_review.clear_drawing")}
                onClick={onClearDrawing}
                className="grid size-7 place-items-center rounded-sm text-secondary hover:bg-layer-transparent-hover"
              >
                <Eraser className="size-4" />
              </button>
            </Tooltip>
          </>
        )}
      </div>
      <TextArea
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        onFocus={onFocus}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canSubmit) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        className="min-h-16 w-full resize-none text-13"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-12 text-tertiary">
          {positionLabel ?? t("media_review.pick_point")}
          {shapeCount > 0 && ` · ${t("media_review.with_drawing")}`}
        </span>
        <div className="flex shrink-0 gap-2">
          {hasContent && (
            <Button variant="neutral-primary" size="sm" onClick={onCancel}>
              {t("cancel")}
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={onSubmit} loading={submitting} disabled={!canSubmit}>
            {t("media_review.send")}
          </Button>
        </div>
      </div>
    </div>
  );
}
