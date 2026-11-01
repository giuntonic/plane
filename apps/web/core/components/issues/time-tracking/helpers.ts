/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";

// Pespo: tempo gasto por peça.

/** "2h 15min", "45min", "0min". */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}min`;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

/** Relógio do cronômetro: "0:12:34". */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Aceita "1h30", "1h 30min", "1:30", "90" (minutos), "45min", "2h", "1,5h". Devolve segundos ou null. */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(",", ".");
  if (!text) return null;
  let minutes: number | null = null;
  const clock = text.match(/^(\d+):([0-5]?\d)$/);
  const parts = text.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*(?:m|min)?)?$/);
  if (clock) minutes = Number(clock[1]) * 60 + Number(clock[2]);
  else if (/^\d+$/.test(text)) minutes = Number(text);
  else if (parts && (parts[1] || parts[2])) minutes = Math.round(Number(parts[1] ?? 0) * 60) + Number(parts[2] ?? 0);
  if (minutes === null || !Number.isFinite(minutes) || minutes < 1 || minutes > 24 * 60) return null;
  return minutes * 60;
}

/** Diferença entre o relógio do servidor e o do navegador, medida quando a resposta chegou (`receivedAt`),
 * para o cronômetro não andar torto se o relógio do computador estiver adiantado ou atrasado. */
export function clockOffset(serverNow: string | undefined, receivedAt: number | undefined): number {
  return serverNow && receivedAt ? new Date(serverNow).getTime() - receivedAt : 0;
}

/** Agora (em ms), atualizado a cada segundo enquanto `active`. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function runningSeconds(startedAt: string, now: number, offset: number): number {
  return Math.max(0, Math.floor((now + offset - new Date(startedAt).getTime()) / 1000));
}
