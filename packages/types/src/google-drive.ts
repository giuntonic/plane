/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TGoogleDriveStatus =
  | { connected: false }
  | {
      connected: true;
      google_email: string;
      connected_at: string;
    };

export type TGoogleDriveView = "my_drive" | "shared" | "recent" | "starred";

export type TGoogleDriveCreatableKind = "document" | "spreadsheet" | "presentation";

/** A file as returned by the Drive browse endpoints (users/me/google-drive/files/). */
export type TGoogleDriveFile = {
  id: string;
  name: string;
  mime_type: string;
  icon_link: string | null;
  web_view_link: string | null;
  thumbnail_link: string | null;
  modified_time: string | null;
  size: number | null;
  is_folder: boolean;
  owner_name: string | null;
  can_edit: boolean;
};

export type TGoogleDriveFileList = {
  files: TGoogleDriveFile[];
  next_page_token: string | null;
};

/** A Drive file linked to a work item (metadata stored in Plane). */
export type TIssueGoogleDriveFile = {
  id: string;
  issue: string;
  project: string;
  workspace: string;
  drive_file_id: string;
  name: string;
  mime_type: string;
  web_view_link: string;
  icon_link: string;
  created_by: string | null;
  created_by_detail: { id: string; display_name: string; avatar_url?: string } | null;
  created_at: string;
};

export type TGoogleDriveErrorCode =
  | "GOOGLE_DRIVE_NOT_CONNECTED"
  | "GOOGLE_DRIVE_FORBIDDEN"
  | "GOOGLE_DRIVE_NOT_FOUND"
  | "GOOGLE_DRIVE_ERROR"
  | "GOOGLE_DRIVE_FILE_TOO_LARGE"
  | "GOOGLE_DRIVE_NOT_EXPORTABLE"
  | "GOOGLE_DRIVE_TYPE_NOT_ALLOWED";
