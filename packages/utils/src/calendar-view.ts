/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { sortBy } from "lodash-es";
import type { TGoogleCalendarEvent, TGoogleCalendarListEntry } from "@plane/types";
import { toLocalDateKey } from "./home-agenda";

// Pespo: regras puras da página de calendário (cores do Google e disposição da visão de semana).

/** Paleta de cores de evento do Google Calendar (`colorId` de 1 a 11), como o Google mostra hoje. */
export const GOOGLE_EVENT_COLORS: Record<string, string> = {
  "1": "#7986cb",
  "2": "#33b679",
  "3": "#8e24aa",
  "4": "#e67c73",
  "5": "#f6bf26",
  "6": "#f4511e",
  "7": "#039be5",
  "8": "#616161",
  "9": "#3f51b5",
  "10": "#0b8043",
  "11": "#d50000",
};

const FALLBACK_COLOR = "#039be5";

/** Texto escuro ou claro, o que tiver mais contraste com `hex` (luminância relativa do WCAG). */
export const readableTextColor = (hex: string) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "#ffffff";
  const value = parseInt(match[1], 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 0xff) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luminance > 0.45 ? "#1f1f1f" : "#ffffff";
};

/** Cor de um evento: a cor própria do evento (colorId) ou a da agenda, com o texto que o Google usaria. */
export const getEventColors = (
  event: Pick<TGoogleCalendarEvent, "colorId">,
  calendar?: Pick<TGoogleCalendarListEntry, "background_color" | "foreground_color"> | null
) => {
  const own = event.colorId ? GOOGLE_EVENT_COLORS[event.colorId] : undefined;
  if (own) return { background: own, foreground: readableTextColor(own) };
  const background = calendar?.background_color || FALLBACK_COLOR;
  return { background, foreground: calendar?.foreground_color || readableTextColor(background) };
};

/** Evento de dia inteiro, ou com horário que atravessa a meia-noite (na semana, os dois vão para a faixa de cima). */
export const isAllDayOrMultiDay = (event: Pick<TGoogleCalendarEvent, "start" | "end">) => {
  if (event.start?.date || !event.start?.dateTime) return true;
  if (!event.end?.dateTime) return false;
  const start = new Date(event.start.dateTime);
  const end = new Date(new Date(event.end.dateTime).getTime() - 1);
  return toLocalDateKey(start) !== toLocalDateKey(end);
};

export type TTimedSlot = { id: string; start: number; end: number };
export type TPlacedSlot = TTimedSlot & { column: number; columns: number };

/** Minutos desde a meia-noite (hora local) do início e do fim de um evento com horário. */
export const getEventMinutes = (event: Pick<TGoogleCalendarEvent, "start" | "end">) => {
  if (!event.start?.dateTime) return null;
  const start = new Date(event.start.dateTime);
  const end = event.end?.dateTime ? new Date(event.end.dateTime) : new Date(start.getTime() + 30 * 60_000);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = toLocalDateKey(end) === toLocalDateKey(start) ? end.getHours() * 60 + end.getMinutes() : 24 * 60;
  return { start: startMinutes, end: Math.max(endMinutes, startMinutes + 15) };
};

/**
 * Coloca lado a lado os eventos que se sobrepõem num dia: cada grupo de eventos encadeados divide a
 * largura em colunas, e cada evento fica na primeira coluna livre (como no Google Calendar).
 */
export const layoutTimedSlots = (slots: TTimedSlot[]): TPlacedSlot[] => {
  const sorted = sortBy(slots, [(slot) => slot.start, (slot) => -slot.end]);
  const placed: TPlacedSlot[] = [];
  let group: TPlacedSlot[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -1;

  const closeGroup = () => {
    const columns = columnEnds.length;
    for (const slot of group) slot.columns = columns;
    placed.push(...group);
    group = [];
    columnEnds = [];
  };

  for (const slot of sorted) {
    if (group.length > 0 && slot.start >= groupEnd) closeGroup();
    let column = columnEnds.findIndex((end) => end <= slot.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(slot.end);
    } else columnEnds[column] = slot.end;
    group.push({ ...slot, column, columns: 1 });
    groupEnd = Math.max(groupEnd, slot.end);
  }
  if (group.length > 0) closeGroup();
  return placed;
};
