/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPieceCategory, TPieceRequestError } from "@plane/types";

export const PIECE_CATEGORIES: TPieceCategory[] = ["Post", "Reels", "Artigo", "Anuncio"];

export const getPiecesPanelKey = (workspaceSlug: string, projectId: string) =>
  `PROJECT_PIECES_PANEL_${workspaceSlug}_${projectId}`;

/** Mensagem traduzida de um erro do pedido de peças ou de refação. */
export const pieceErrorMessage = (t: (key: string, params?: Record<string, unknown>) => string, error: unknown) => {
  const code = (error as Partial<TPieceRequestError> | undefined)?.code;
  const params = (error as Partial<TPieceRequestError> | undefined)?.params ?? {};
  return code ? t(`pieces_panel.errors.${code}`, params) : t("pieces_panel.errors.generic");
};

/** "2026-10-23" -> data curta no idioma da pessoa, sem cair no dia anterior pelo fuso. */
export const formatDay = (value: string, locale: string) => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale, { timeZone: "UTC" });
};
