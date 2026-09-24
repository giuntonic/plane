/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  getGoogleDriveEmbedUrl,
  getGoogleDriveKindFromMimeType,
  getGoogleDriveOpenUrl,
  isGoogleDriveKindEditable,
  parseGoogleDriveUrl,
} from "./google-drive";

describe("parseGoogleDriveUrl", () => {
  it.each([
    ["https://docs.google.com/document/d/1AbC_d-9/edit?usp=sharing", "1AbC_d-9", "document"],
    ["https://docs.google.com/document/u/1/d/1AbC/edit", "1AbC", "document"],
    ["https://docs.google.com/spreadsheets/d/sheet123/edit#gid=0", "sheet123", "spreadsheet"],
    ["https://docs.google.com/presentation/d/slides1", "slides1", "presentation"],
    ["https://docs.google.com/drawings/d/draw1/edit", "draw1", "drawing"],
    ["https://drive.google.com/file/d/pdf1/view?usp=drive_link", "pdf1", "file"],
    ["https://drive.google.com/drive/folders/folder1", "folder1", "folder"],
    ["https://drive.google.com/drive/u/0/folders/folder2?usp=sharing", "folder2", "folder"],
    ["https://drive.google.com/open?id=legacy1", "legacy1", "file"],
    ["  https://drive.google.com/uc?id=legacy2&export=download  ", "legacy2", "file"],
  ])("parses %s", (url, fileId, kind) => {
    expect(parseGoogleDriveUrl(url)).toEqual({ fileId, kind });
  });

  it.each([
    "",
    "not a url",
    "https://example.com/document/d/abc/edit",
    "https://docs.google.com.evil.com/document/d/abc/edit",
    "https://docs.google.com/forms/d/abc/viewform",
    "javascript:alert(1)//docs.google.com/document/d/abc",
    "https://drive.google.com/open?id=bad'id",
  ])("rejects %s", (url) => {
    expect(parseGoogleDriveUrl(url)).toBeNull();
  });
});

describe("getGoogleDriveEmbedUrl", () => {
  it("builds preview and edit urls for Google-native files", () => {
    const ref = { fileId: "doc1", kind: "document" } as const;
    expect(getGoogleDriveEmbedUrl(ref)).toBe("https://docs.google.com/document/d/doc1/preview");
    expect(getGoogleDriveEmbedUrl(ref, "edit")).toBe("https://docs.google.com/document/d/doc1/edit");
    expect(getGoogleDriveEmbedUrl({ fileId: "s1", kind: "spreadsheet" }, "edit")).toBe(
      "https://docs.google.com/spreadsheets/d/s1/edit"
    );
  });

  it("falls back to the Drive previewer for binary files, even in edit mode", () => {
    expect(getGoogleDriveEmbedUrl({ fileId: "pdf1", kind: "file" }, "edit")).toBe(
      "https://drive.google.com/file/d/pdf1/preview"
    );
  });

  it("embeds folders as a list", () => {
    expect(getGoogleDriveEmbedUrl({ fileId: "f1", kind: "folder" })).toBe(
      "https://drive.google.com/embeddedfolderview?id=f1#list"
    );
  });

  it("never builds a url from an invalid id", () => {
    expect(getGoogleDriveEmbedUrl({ fileId: "../x", kind: "document" })).toBe("");
    expect(getGoogleDriveOpenUrl({ fileId: "a b", kind: "file" })).toBe("");
  });
});

describe("mime type and open url helpers", () => {
  it("maps mime types to kinds", () => {
    expect(getGoogleDriveKindFromMimeType("application/vnd.google-apps.spreadsheet")).toBe("spreadsheet");
    expect(getGoogleDriveKindFromMimeType("application/pdf")).toBe("file");
    expect(getGoogleDriveKindFromMimeType(undefined)).toBe("file");
  });

  it("knows which kinds have a web editor", () => {
    expect(isGoogleDriveKindEditable("document")).toBe(true);
    expect(isGoogleDriveKindEditable("file")).toBe(false);
    expect(isGoogleDriveKindEditable("folder")).toBe(false);
  });

  it("builds open urls", () => {
    expect(getGoogleDriveOpenUrl({ fileId: "p1", kind: "presentation" })).toBe(
      "https://docs.google.com/presentation/d/p1/edit"
    );
    expect(getGoogleDriveOpenUrl({ fileId: "x", kind: "file" })).toBe("https://drive.google.com/file/d/x/view");
  });
});
