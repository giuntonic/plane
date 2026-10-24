/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  getEventColors,
  getEventMinutes,
  isAllDayOrMultiDay,
  layoutTimedSlots,
  readableTextColor,
} from "./calendar-view";

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

describe("getEventColors", () => {
  it("uses the event's own color over the calendar's", () => {
    expect(getEventColors({ colorId: "11" }, { background_color: "#9fe1e7" }).background).toBe("#d50000");
  });

  it("falls back to the calendar color and its foreground", () => {
    expect(getEventColors({}, { background_color: "#9fe1e7", foreground_color: "#000000" })).toEqual({
      background: "#9fe1e7",
      foreground: "#000000",
    });
  });

  it("picks a readable text color", () => {
    expect(readableTextColor("#f6bf26")).toBe("#1f1f1f");
    expect(readableTextColor("#3f51b5")).toBe("#ffffff");
  });
});

describe("isAllDayOrMultiDay", () => {
  it("treats all-day and overnight events as banner events", () => {
    expect(isAllDayOrMultiDay({ start: { date: "2026-10-23" }, end: { date: "2026-10-24" } })).toBe(true);
    expect(isAllDayOrMultiDay({ start: { dateTime: at(23, 22) }, end: { dateTime: at(24, 2) } })).toBe(true);
    expect(isAllDayOrMultiDay({ start: { dateTime: at(23, 9) }, end: { dateTime: at(23, 10) } })).toBe(false);
    // ending exactly at midnight still belongs to the day it started
    expect(isAllDayOrMultiDay({ start: { dateTime: at(23, 23) }, end: { dateTime: at(24, 0) } })).toBe(false);
  });
});

describe("getEventMinutes", () => {
  it("returns local minutes, with a 15 minute minimum", () => {
    expect(getEventMinutes({ start: { dateTime: at(23, 9, 30) }, end: { dateTime: at(23, 11) } })).toEqual({
      start: 570,
      end: 660,
    });
    expect(getEventMinutes({ start: { dateTime: at(23, 9) }, end: { dateTime: at(23, 9) } })).toEqual({
      start: 540,
      end: 555,
    });
  });
});

describe("layoutTimedSlots", () => {
  it("keeps separate events full width", () => {
    const placed = layoutTimedSlots([
      { id: "a", start: 540, end: 600 },
      { id: "b", start: 600, end: 660 },
    ]);
    expect(placed.map((slot) => [slot.id, slot.column, slot.columns])).toEqual([
      ["a", 0, 1],
      ["b", 0, 1],
    ]);
  });

  it("splits overlapping events into columns and reuses free ones", () => {
    const placed = layoutTimedSlots([
      { id: "long", start: 540, end: 720 },
      { id: "first", start: 540, end: 600 },
      { id: "second", start: 600, end: 660 },
    ]);
    const byId = Object.fromEntries(placed.map((slot) => [slot.id, slot]));
    expect(byId.long).toMatchObject({ column: 0, columns: 2 });
    expect(byId.first).toMatchObject({ column: 1, columns: 2 });
    expect(byId.second).toMatchObject({ column: 1, columns: 2 });
  });
});
