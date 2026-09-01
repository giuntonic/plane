/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: bloco de embed de vídeo (Clapshot) — guarda só a URL da revisão.
export enum EClapshotEmbedAttributeNames {
  URL = "url",
}

export type TClapshotEmbedAttributes = {
  [EClapshotEmbedAttributeNames.URL]: string | undefined;
};
