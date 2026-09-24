/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: bloco de embed de arquivo do Google Drive (Docs/Sheets/Slides/PDF…).
// Os nomes dos atributos são minúsculos/snake_case porque viram atributos HTML
// e precisam bater com a allowlist de apps/api/plane/utils/content_validator.py.
export enum EGoogleDriveEmbedAttributeNames {
  URL = "url",
  NAME = "name",
  MIME_TYPE = "mime_type",
  MODE = "mode",
  HEIGHT = "height",
}

export type TGoogleDriveEmbedAttributes = {
  [EGoogleDriveEmbedAttributeNames.URL]: string | undefined;
  [EGoogleDriveEmbedAttributeNames.NAME]: string | undefined;
  [EGoogleDriveEmbedAttributeNames.MIME_TYPE]: string | undefined;
  [EGoogleDriveEmbedAttributeNames.MODE]: "preview" | "edit";
  [EGoogleDriveEmbedAttributeNames.HEIGHT]: number;
};

/** What the host app's Drive picker returns (subset of the web app's TGoogleDriveFile). */
export type TGoogleDrivePickedFile = {
  id: string;
  name: string;
  mime_type: string;
  web_view_link: string | null;
};

export type TGoogleDriveEmbedExtensionOptions = {
  /** Opens the host app's Drive picker; undefined where there is none (e.g. public pages). */
  onPickGoogleDriveFile?: () => Promise<TGoogleDrivePickedFile | null>;
};

export const GOOGLE_DRIVE_EMBED_DEFAULT_HEIGHT = 600;
export const GOOGLE_DRIVE_EMBED_MIN_HEIGHT = 240;
export const GOOGLE_DRIVE_EMBED_MAX_HEIGHT = 1600;
