/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TGoogleDriveEmbedExtensionOptions } from "../extensions/google-drive-embed/types";

export type IEditorExtensionOptions = unknown;

// Pespo: callback pro botão "Aprovar edição" do embed do Clapshot — ver
// packages/editor/src/ce/extensions/clapshot-embed. Threading segue o
// mesmo padrão do fileHandler (apps/web fecha sobre suas próprias stores
// e injeta a função aqui, o editor genérico nunca conhece @/hooks/store).
// Pespo: `onPickGoogleDriveFile` abre o seletor do Google Drive do apps/web
// (ver packages/editor/src/ce/extensions/google-drive-embed) — mesmo padrão.
export type IEditorPropsExtended = {
  onApproveEdit?: () => Promise<void>;
  onPickGoogleDriveFile?: TGoogleDriveEmbedExtensionOptions["onPickGoogleDriveFile"];
  getGoogleDrivePreviewUrl?: TGoogleDriveEmbedExtensionOptions["getPreviewUrl"];
};

export type ICollaborativeDocumentEditorPropsExtended = unknown;

export type TExtendedEditorCommands = never;

export type TExtendedCommandExtraProps = unknown;

export type TExtendedEditorRefApi = unknown;
