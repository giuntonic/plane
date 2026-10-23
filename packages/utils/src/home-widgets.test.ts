/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  HOME_WIDGET_MAX_HEIGHT,
  HOME_WIDGET_MIN_HEIGHT,
  getHomeWidgetHeight,
  getHomeWidgetWidth,
  getResizedHomeWidgetSize,
} from "./home-widgets";

// 4 columns of 280px with a 16px gap: one column = 280, two = 576, three = 872, four = 1168
const start = { width: 576, height: 300, columnWidth: 280, gap: 16, columns: 4 };

describe("getHomeWidgetWidth", () => {
  it("uses the default when nothing is saved", () => {
    expect(getHomeWidgetWidth(undefined)).toBe(2);
  });

  it("keeps the width inside the grid", () => {
    expect(getHomeWidgetWidth(0)).toBe(1);
    expect(getHomeWidgetWidth(9)).toBe(4);
    expect(getHomeWidgetWidth(2.6)).toBe(3);
  });
});

describe("getHomeWidgetHeight", () => {
  it("is undefined (auto) when nothing is saved", () => {
    expect(getHomeWidgetHeight(undefined)).toBeUndefined();
  });

  it("keeps the height inside the limits", () => {
    expect(getHomeWidgetHeight(10)).toBe(HOME_WIDGET_MIN_HEIGHT);
    expect(getHomeWidgetHeight(99999)).toBe(HOME_WIDGET_MAX_HEIGHT);
    expect(getHomeWidgetHeight(420)).toBe(420);
  });
});

describe("getResizedHomeWidgetSize", () => {
  it("does not change without movement", () => {
    expect(getResizedHomeWidgetSize(start, 0, 0)).toEqual({ w: 2, h: 300 });
  });

  it("snaps the width to the nearest column", () => {
    expect(getResizedHomeWidgetSize(start, 120, 0).w).toBe(2);
    expect(getResizedHomeWidgetSize(start, 170, 0).w).toBe(3);
    expect(getResizedHomeWidgetSize(start, 600, 0).w).toBe(4);
    expect(getResizedHomeWidgetSize(start, -300, 0).w).toBe(1);
  });

  it("never goes beyond the grid", () => {
    expect(getResizedHomeWidgetSize(start, 5000, 0).w).toBe(4);
    expect(getResizedHomeWidgetSize(start, -5000, 0).w).toBe(1);
  });

  it("snaps the height to steps and keeps it inside the limits", () => {
    expect(getResizedHomeWidgetSize(start, 0, 47).h).toBe(340);
    expect(getResizedHomeWidgetSize(start, 0, -1000).h).toBe(HOME_WIDGET_MIN_HEIGHT);
    expect(getResizedHomeWidgetSize(start, 0, 5000).h).toBe(HOME_WIDGET_MAX_HEIGHT);
  });
});
