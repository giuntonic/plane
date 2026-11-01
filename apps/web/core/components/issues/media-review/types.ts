/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueAttachment } from "@plane/types";

// Pespo: revisão de peça (vídeo ou imagem) dentro do item de trabalho, no lugar do Clapshot.

export type TMediaKind = "image" | "video";

export type TDrawingTool = "pen" | "arrow" | "rect";

/** Forma do desenho, com coordenadas de 0 a 1 e a espessura como fração da largura da mídia. */
export type TDrawingShape = {
  tool: TDrawingTool;
  color: string;
  width: number;
  points: [number, number][];
};

export type TMediaReviewComment = {
  id: string;
  issue: string;
  project: string;
  workspace: string;
  asset: string;
  parent: string | null;
  timecode: number | null;
  x: number | null;
  y: number | null;
  drawing: TDrawingShape[];
  text: string;
  comment: string | null;
  edited_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TMediaReviewCommentPayload = {
  asset?: string;
  parent?: string;
  timecode?: number;
  x?: number;
  y?: number;
  drawing?: TDrawingShape[];
  text?: string;
};

export type TMediaReviewCommentUpdate = { text?: string; resolved?: boolean };

/** Anexo de imagem ou vídeo do item: cada um é uma versão da peça, na ordem em que foi enviado. */
export type TReviewVersion = {
  attachment: TIssueAttachment & { created_at?: string };
  kind: TMediaKind;
  number: number;
  createdAt: number;
};

/** Marcação gravada só como comentário (Marcação da Peça antiga ou portal do cliente): só leitura. */
export type TLegacyMark = {
  id: string;
  author: string;
  text: string;
  timecode: number | null;
  x: number | null;
  y: number | null;
  createdAt: string;
};

export type TVersionDecision = {
  kind: "approved" | "rework";
  author: string;
  date: string;
  reason?: string;
  createdAt: number;
};

/** Marcação na linha do tempo ou na imagem (comentário novo ou antigo). */
export type TReviewMarker = {
  id: string;
  timecode: number | null;
  x: number | null;
  y: number | null;
  label: string;
  preview: string;
  resolved: boolean;
  legacy: boolean;
  hasDrawing: boolean;
};

/** Conversão de um vídeo anexado (cópia que toca no navegador, capa e miniaturas da linha do tempo). */
export type TMediaRenditionSprite = {
  interval: number;
  count: number;
  columns: number;
  rows: number;
  tile_width: number;
  tile_height: number;
};

export type TMediaRendition = {
  asset: string;
  status: "pending" | "processing" | "ready" | "failed";
  duration: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  has_playback: boolean;
  has_poster: boolean;
  sprite: TMediaRenditionSprite | null;
  error: string;
  updated_at: string;
};

export type TTimelinePreview = TMediaRenditionSprite & { url: string };
