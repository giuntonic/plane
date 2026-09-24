/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IEditorPropsExtended } from "@plane/editor";
import { getGoogleDriveProxyPreviewUrl } from "@plane/utils";
// Pespo: seletor do Google Drive pro bloco /google-drive nas Páginas.
import { pickGoogleDriveFile } from "@/components/integration/google-drive/picker-store";
import type { TSearchEntityRequestPayload, TSearchResponse } from "@plane/types";
import type { TPageInstance } from "@/store/pages/base-page";
import type { EPageStoreType } from "@/hooks/store";

export type TExtendedEditorExtensionsHookParams = {
  workspaceSlug: string;
  page: TPageInstance;
  storeType: EPageStoreType;
  fetchEntity: (payload: TSearchEntityRequestPayload) => Promise<TSearchResponse>;
  getRedirectionLink: (pageId?: string) => string;
  extensionHandlers?: Map<string, unknown>;
  projectId?: string;
};

export type TExtendedEditorExtensionsConfig = IEditorPropsExtended;

// Module-level constant: a stable reference keeps the editor from rebuilding
// its extensions on every render.
const EXTENDED_EDITOR_PROPS: TExtendedEditorExtensionsConfig = {
  onPickGoogleDriveFile: pickGoogleDriveFile,
  getGoogleDrivePreviewUrl: (ref) => getGoogleDriveProxyPreviewUrl(ref, API_BASE_URL),
};

export const useExtendedEditorProps = (_params: TExtendedEditorExtensionsHookParams): TExtendedEditorExtensionsConfig =>
  EXTENDED_EDITOR_PROPS;
