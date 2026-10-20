/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  countCompletedChecklistItems,
  getChecklistChildren,
  getChecklistSortOrderBetween,
  getChecklistSubtreeIds,
  getChecklistVisibleOrder,
} from "./issue-checklist";

const line = (id: string, parent: string | null, sort_order: number, extra: { is_completed?: boolean } = {}) => ({
  id,
  parent,
  sort_order,
  created_at: `2026-10-20T10:00:0${id.length}Z`,
  is_completed: extra.is_completed ?? false,
});

// a
// ├─ a1
// │  └─ a1x
// └─ a2
// b
const items = [
  line("b", null, 200),
  line("a2", "a", 20),
  line("a", null, 100),
  line("a1x", "a1", 5, { is_completed: true }),
  line("a1", "a", 10, { is_completed: true }),
];

describe("getChecklistChildren", () => {
  it("returns direct children in sort order", () => {
    expect(getChecklistChildren(items, null).map((item) => item.id)).toEqual(["a", "b"]);
    expect(getChecklistChildren(items, "a").map((item) => item.id)).toEqual(["a1", "a2"]);
    expect(getChecklistChildren(items, "b")).toEqual([]);
  });

  it("breaks sort_order ties by creation time", () => {
    const tied = [line("second", null, 1), line("x", null, 1)];
    tied[0].created_at = "2026-10-20T10:00:02Z";
    tied[1].created_at = "2026-10-20T10:00:01Z";
    expect(getChecklistChildren(tied, null).map((item) => item.id)).toEqual(["x", "second"]);
  });
});

describe("getChecklistSubtreeIds", () => {
  it("includes the line and every descendant", () => {
    expect([...getChecklistSubtreeIds(items, "a")].sort()).toEqual(["a", "a1", "a1x", "a2"]);
    expect([...getChecklistSubtreeIds(items, "b")]).toEqual(["b"]);
  });
});

describe("getChecklistVisibleOrder", () => {
  it("walks the tree depth-first", () => {
    expect(getChecklistVisibleOrder(items, new Set())).toEqual(["a", "a1", "a1x", "a2", "b"]);
  });

  it("skips the children of collapsed lines", () => {
    expect(getChecklistVisibleOrder(items, new Set(["a1"]))).toEqual(["a", "a1", "a2", "b"]);
    expect(getChecklistVisibleOrder(items, new Set(["a"]))).toEqual(["a", "b"]);
  });
});

describe("getChecklistSortOrderBetween", () => {
  it.each([
    [undefined, undefined, 65535],
    [{ sort_order: 100 }, undefined, 10100],
    [undefined, { sort_order: 100 }, -9900],
    [{ sort_order: 100 }, { sort_order: 200 }, 150],
  ])("between %o and %o is %d", (before, after, expected) => {
    expect(getChecklistSortOrderBetween(before, after)).toBe(expected);
  });
});

describe("countCompletedChecklistItems", () => {
  it("counts completed lines", () => {
    expect(countCompletedChecklistItems(items)).toBe(2);
  });
});
