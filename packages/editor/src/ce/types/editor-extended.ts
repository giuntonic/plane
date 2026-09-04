/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type IEditorExtensionOptions = unknown;

// Pespo: callback pro botão "Aprovar edição" do embed do Clapshot — ver
// packages/editor/src/ce/extensions/clapshot-embed. Threading segue o
// mesmo padrão do fileHandler (apps/web fecha sobre suas próprias stores
// e injeta a função aqui, o editor genérico nunca conhece @/hooks/store).
export type IEditorPropsExtended = {
  onApproveEdit?: () => Promise<void>;
};

export type ICollaborativeDocumentEditorPropsExtended = unknown;

export type TExtendedEditorCommands = never;

export type TExtendedCommandExtraProps = unknown;

export type TExtendedEditorRefApi = unknown;
