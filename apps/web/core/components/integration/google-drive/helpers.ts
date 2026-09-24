/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TGoogleDriveErrorCode } from "@plane/types";

const ERROR_KEYS: Partial<Record<TGoogleDriveErrorCode, string>> = {
  GOOGLE_DRIVE_FORBIDDEN: "google_drive_integration.errors.forbidden",
  GOOGLE_DRIVE_NOT_FOUND: "google_drive_integration.errors.not_found",
  GOOGLE_DRIVE_FILE_TOO_LARGE: "google_drive_integration.errors.too_large",
  GOOGLE_DRIVE_NOT_EXPORTABLE: "google_drive_integration.errors.not_exportable",
  GOOGLE_DRIVE_TYPE_NOT_ALLOWED: "google_drive_integration.errors.type_not_allowed",
};

export const getGoogleDriveErrorCode = (error: unknown): TGoogleDriveErrorCode | undefined =>
  (error as { code?: TGoogleDriveErrorCode } | undefined)?.code;

/** i18n key of the message to show for a failed Drive request (services throw the response body). */
export const getGoogleDriveErrorKey = (error: unknown): string =>
  ERROR_KEYS[getGoogleDriveErrorCode(error) ?? "GOOGLE_DRIVE_ERROR"] ?? "google_drive_integration.errors.generic";

/** Path of the current screen, so the OAuth flow brings the user back to it. */
export const getCurrentPathForRedirect = (): string =>
  typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`;

/**
 * Sandbox for iframes that show Google's own editor/preview. The src is always
 * built from a validated Drive id on a Google origin, so allow-same-origin only
 * grants Google its own cookies — never access to Plane's origin.
 * allow-storage-access-by-user-activation lets Google's "enable cookies" prompt
 * ask the browser for its cookies when third-party cookies are blocked.
 */
export const GOOGLE_EMBED_SANDBOX = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-downloads",
  "allow-modals",
  "allow-storage-access-by-user-activation",
  "allow-top-navigation-by-user-activation",
].join(" ");
