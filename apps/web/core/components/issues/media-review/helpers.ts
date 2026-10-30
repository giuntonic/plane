/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueAttachment } from "@plane/types";
// local imports
import type { TLegacyMark, TMediaKind, TReviewVersion, TVersionDecision } from "./types";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v", "avi", "mkv", "ogv"]);

export const DRAWING_COLORS = ["#ef4444", "#facc15", "#22c55e", "#3b82f6", "#ffffff"];
export const DRAWING_WIDTH = 0.004;
export const PLAYBACK_RATES = [1, 1.5, 2, 0.25, 0.5];
export const DEFAULT_FPS = 30;

export function mediaKindOf(attachment: TIssueAttachment): TMediaKind | null {
  const type = attachment.attributes.type ?? "";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  const parts = attachment.attributes.name.split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return null;
}

const timeOf = (attachment: TIssueAttachment & { created_at?: string }) =>
  new Date(attachment.created_at ?? attachment.updated_at).getTime();

/** As imagens e os vídeos do item, do mais antigo (v1) para o mais novo. */
export function buildVersions(attachments: TIssueAttachment[]): TReviewVersion[] {
  return (
    attachments
      .map((attachment) => ({ attachment, kind: mediaKindOf(attachment) }))
      .filter((entry): entry is { attachment: TIssueAttachment; kind: TMediaKind } => !!entry.kind)
      // oxlint-disable-next-line unicorn/no-array-sort -- a lista acabou de ser criada pelo map
      .sort((a, b) => timeOf(a.attachment) - timeOf(b.attachment))
      .map(({ attachment, kind }, index) => ({ attachment, kind, number: index + 1, createdAt: timeOf(attachment) }))
  );
}

/** Versão que era a mais nova num momento (para pendurar aprovações e marcações antigas). */
export function versionAt(versions: TReviewVersion[], time: number): TReviewVersion | undefined {
  let found: TReviewVersion | undefined;
  for (const version of versions) if (version.createdAt <= time) found = version;
  return found;
}

/** m:ss ou h:mm:ss, como nos comentários; com `fraction`, os centésimos (m:ss.cc). */
export function formatTimecode(totalSeconds: number, fraction = false): string {
  const safe = Math.max(0, totalSeconds || 0);
  const whole = fraction ? Math.floor(safe) : Math.round(safe);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  const base = h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  if (!fraction) return base;
  const cents = String(Math.floor((safe - Math.floor(safe)) * 100)).padStart(2, "0");
  return `${base}.${cents}`;
}

function parseClock(value: string): number {
  const parts = value.split(":").map(Number);
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

// Formatos fixos dos comentários: os da Marcação da Peça antiga e os do portal do cliente. As
// aprovações são lidas também pelo n8n ("Peça Aprovada"), então o texto não pode mudar.
const PIN_IMAGE_REGEX = /^📍 Marca[cç][aã]o (?:de (.+?)|do cliente \((.*?)\)) em \(([\d.]+)%, ([\d.]+)%\): (.*)$/s;
const PIN_VIDEO_REGEX = /^🎬 Marca[cç][aã]o (?:de (.+?)|do cliente \((.*?)\)) em (\d+:\d{2}(?::\d{2})?): (.*)$/s;
const APPROVAL_REGEX = /^✅ Pe[cç]a aprovada por (.+?) em (\d{2}\/\d{2}\/\d{4})$/;
const REWORK_REGEX = /^🔁 Refa[cç][aã]o pedida por (.+?) em (\d{2}\/\d{2}\/\d{4}): (.*)$/s;

type TCommentLike = { id: string; comment_stripped?: string; created_at?: Date | string };

export function parseLegacyMark(comment: TCommentLike): TLegacyMark | null {
  const text = (comment.comment_stripped || "").trim();
  const createdAt = String(comment.created_at ?? "");
  const image = text.match(PIN_IMAGE_REGEX);
  if (image)
    return {
      id: comment.id,
      author: image[1] ?? image[2] ?? "",
      x: parseFloat(image[3]),
      y: parseFloat(image[4]),
      timecode: null,
      text: image[5],
      createdAt,
    };
  const video = text.match(PIN_VIDEO_REGEX);
  if (video)
    return {
      id: comment.id,
      author: video[1] ?? video[2] ?? "",
      timecode: parseClock(video[3]),
      x: null,
      y: null,
      text: video[4],
      createdAt,
    };
  return null;
}

export function parseDecision(comment: TCommentLike): TVersionDecision | null {
  const text = (comment.comment_stripped || "").trim();
  const createdAt = new Date(comment.created_at ?? 0).getTime();
  const approval = text.match(APPROVAL_REGEX);
  if (approval) return { kind: "approved", author: approval[1], date: approval[2], createdAt };
  const rework = text.match(REWORK_REGEX);
  if (rework) return { kind: "rework", author: rework[1], date: rework[2], reason: rework[3], createdAt };
  return null;
}

export function formatDateBR(date: Date): string {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Estima os quadros por segundo pela diferença de tempo entre quadros mostrados (requestVideoFrameCallback). */
export function estimateFps(deltas: number[]): number | null {
  // oxlint-disable-next-line unicorn/no-array-sort -- o filter já devolve uma cópia
  const valid = deltas.filter((delta) => delta > 0.005 && delta < 0.2).sort((a, b) => a - b);
  if (valid.length < 5) return null;
  const median = valid[Math.floor(valid.length / 2)];
  const fps = 1 / median;
  // arredonda para as taxas comuns (23.976 → 24, 29.97 → 30)
  const common = [24, 25, 30, 48, 50, 60];
  const nearest = common.reduce((best, rate) => (Math.abs(rate - fps) < Math.abs(best - fps) ? rate : best));
  return Math.abs(nearest - fps) < 1.5 ? nearest : Math.round(fps);
}
