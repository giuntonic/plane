/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: tamanho dos widgets na grade da home (largura em colunas, altura em px).

export const HOME_GRID_COLUMNS = 4;
export const HOME_WIDGET_DEFAULT_WIDTH = 2;
export const HOME_WIDGET_MIN_HEIGHT = 160;
export const HOME_WIDGET_MAX_HEIGHT = 1200;
export const HOME_WIDGET_HEIGHT_STEP = 20;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A saved width, or the default, kept between 1 and the number of columns. */
export const getHomeWidgetWidth = (width: number | undefined, fallback = HOME_WIDGET_DEFAULT_WIDTH) => {
  const value = Number.isFinite(width) ? Math.round(width as number) : fallback;
  return clamp(value, 1, HOME_GRID_COLUMNS);
};

/** A saved height in px, or undefined (= as tall as the content). */
export const getHomeWidgetHeight = (height: number | undefined) =>
  Number.isFinite(height) ? clamp(height as number, HOME_WIDGET_MIN_HEIGHT, HOME_WIDGET_MAX_HEIGHT) : undefined;

export type THomeWidgetResizeStart = {
  /** Card size when the drag started, in px. */
  width: number;
  height: number;
  /** Width of one grid column and the gap between columns, in px. */
  columnWidth: number;
  gap: number;
  columns: number;
};

/**
 * Size while dragging the resize handle: the width snaps to whole columns and the height to
 * HOME_WIDGET_HEIGHT_STEP, both kept inside the grid's limits.
 */
export const getResizedHomeWidgetSize = (start: THomeWidgetResizeStart, deltaX: number, deltaY: number) => {
  const step = start.columnWidth + start.gap;
  const width = step > 0 ? clamp(Math.round((start.width + deltaX + start.gap) / step), 1, start.columns) : 1;
  const height = clamp(
    Math.round((start.height + deltaY) / HOME_WIDGET_HEIGHT_STEP) * HOME_WIDGET_HEIGHT_STEP,
    HOME_WIDGET_MIN_HEIGHT,
    HOME_WIDGET_MAX_HEIGHT
  );
  return { w: width, h: height };
};
