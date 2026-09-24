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
