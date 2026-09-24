/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: helpers da integração com o Google Drive, usados pelo widget do item
// de trabalho (apps/web) e pelo embed do editor (packages/editor). Todo iframe
// é montado a partir do id validado — nunca a partir da URL colada pelo usuário.

export type TGoogleDriveKind = "document" | "spreadsheet" | "presentation" | "drawing" | "file" | "folder";

export type TGoogleDriveEmbedMode = "preview" | "edit";

export type TGoogleDriveFileRef = {
  fileId: string;
  kind: TGoogleDriveKind;
};

const DRIVE_ID = "[A-Za-z0-9_-]+";
const DRIVE_ID_RE = new RegExp(`^${DRIVE_ID}$`);

const DOCS_PATH_RE = new RegExp(
  `^/(document|spreadsheets|presentation|drawings)(?:/u/\\d+)?/d/(${DRIVE_ID})(?:[/?#]|$)`
);
const DRIVE_FILE_PATH_RE = new RegExp(`^/file(?:/u/\\d+)?/d/(${DRIVE_ID})(?:[/?#]|$)`);
const DRIVE_FOLDER_PATH_RE = new RegExp(`^/drive(?:/u/\\d+)?/(?:mobile/)?folders/(${DRIVE_ID})(?:[/?#]|$)`);

const DOCS_SEGMENT_TO_KIND: Record<string, TGoogleDriveKind> = {
  document: "document",
  spreadsheets: "spreadsheet",
  presentation: "presentation",
  drawings: "drawing",
};

const KIND_TO_DOCS_SEGMENT: Partial<Record<TGoogleDriveKind, string>> = {
  document: "document",
  spreadsheet: "spreadsheets",
  presentation: "presentation",
  drawing: "drawings",
};

const MIME_TO_KIND: Record<string, TGoogleDriveKind> = {
  "application/vnd.google-apps.document": "document",
  "application/vnd.google-apps.spreadsheet": "spreadsheet",
  "application/vnd.google-apps.presentation": "presentation",
  "application/vnd.google-apps.drawing": "drawing",
  "application/vnd.google-apps.folder": "folder",
};

export const isValidGoogleDriveId = (value: string | null | undefined): value is string =>
  !!value && DRIVE_ID_RE.test(value);

/** Maps a Drive mime type to the kind of Google editor/viewer that opens it. */
export const getGoogleDriveKindFromMimeType = (mimeType: string | null | undefined): TGoogleDriveKind =>
  (mimeType && MIME_TO_KIND[mimeType]) || "file";

/**
 * Extracts the file id and kind from any Google Docs/Sheets/Slides/Drawings or
 * Drive file/folder link. Returns null for anything that isn't a Google link.
 */
export const parseGoogleDriveUrl = (rawUrl: string | null | undefined): TGoogleDriveFileRef | null => {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  if (url.hostname === "docs.google.com") {
    const match = url.pathname.match(DOCS_PATH_RE);
    if (!match) return null;
    return { fileId: match[2], kind: DOCS_SEGMENT_TO_KIND[match[1]] };
  }

  if (url.hostname === "drive.google.com") {
    const fileMatch = url.pathname.match(DRIVE_FILE_PATH_RE);
    if (fileMatch) return { fileId: fileMatch[1], kind: "file" };

    const folderMatch = url.pathname.match(DRIVE_FOLDER_PATH_RE);
    if (folderMatch) return { fileId: folderMatch[1], kind: "folder" };

    // Legacy links: drive.google.com/open?id=…, drive.google.com/uc?id=…
    const queryId = url.searchParams.get("id");
    if ((url.pathname === "/open" || url.pathname === "/uc") && isValidGoogleDriveId(queryId)) {
      return { fileId: queryId, kind: "file" };
    }
  }

  return null;
};

/** Google-native files (Docs/Sheets/Slides/Drawings) can be edited inside an iframe. */
export const isGoogleDriveKindEditable = (kind: TGoogleDriveKind): boolean => !!KIND_TO_DOCS_SEGMENT[kind];

/** URL to put in an <iframe>. `edit` falls back to `preview` for kinds that have no web editor. */
export const getGoogleDriveEmbedUrl = (ref: TGoogleDriveFileRef, mode: TGoogleDriveEmbedMode = "preview"): string => {
  const { fileId, kind } = ref;
  if (!isValidGoogleDriveId(fileId)) return "";
  const id = encodeURIComponent(fileId);

  if (kind === "folder") return `https://drive.google.com/embeddedfolderview?id=${id}#list`;

  const segment = KIND_TO_DOCS_SEGMENT[kind];
  if (!segment) return `https://drive.google.com/file/d/${id}/preview`;

  return `https://docs.google.com/${segment}/d/${id}/${mode === "edit" ? "edit" : "preview"}`;
};

/** Canonical link that opens the file in a new tab in Google's own UI. */
export const getGoogleDriveOpenUrl = (ref: TGoogleDriveFileRef): string => {
  const { fileId, kind } = ref;
  if (!isValidGoogleDriveId(fileId)) return "";
  const id = encodeURIComponent(fileId);

  if (kind === "folder") return `https://drive.google.com/drive/folders/${id}`;

  const segment = KIND_TO_DOCS_SEGMENT[kind];
  if (!segment) return `https://drive.google.com/file/d/${id}/view`;

  return `https://docs.google.com/${segment}/d/${id}/edit`;
};

/**
 * Plane's own cookie-free preview of a Drive file (served by the API with the
 * viewer's Drive connection — see GoogleDriveFilePreviewEndpoint). Google's
 * embed needs third-party cookies, which many browsers block; this doesn't.
 * Returns "" for folders (they only have Google's folder view) and invalid ids.
 */
export const getGoogleDriveProxyPreviewUrl = (ref: TGoogleDriveFileRef, apiBaseUrl = ""): string => {
  if (ref.kind === "folder" || !isValidGoogleDriveId(ref.fileId)) return "";
  return `${apiBaseUrl.replace(/\/$/, "")}/api/users/me/google-drive/files/${encodeURIComponent(ref.fileId)}/preview/`;
};
