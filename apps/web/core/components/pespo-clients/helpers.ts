/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPespoContractInput } from "@plane/types";

export const PIECE_CATEGORIES = ["Post", "Reels", "Artigo", "Anuncio"];

const iso = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

/** Contrato novo: hoje até o fim do mesmo dia daqui a 12 meses, FEE, 2 urgentes, nada contratado. */
export function emptyContract(start?: string): TPespoContractInput {
  const begin = start ? new Date(`${start}T12:00:00`) : new Date();
  const end = new Date(begin);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  return {
    contract_type: "FEE",
    start_date: iso(begin),
    end_date: iso(end),
    urgent_limit: 2,
    quantities: Object.fromEntries(PIECE_CATEGORIES.map((category) => [category, 0])),
  };
}

/** O dia seguinte ao fim do contrato (início sugerido da renovação). */
export function dayAfter(date: string) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + 1);
  return iso(next);
}

type TT = (key: string, params?: Record<string, unknown>) => string;

export function clientErrorMessage(t: TT, error: unknown) {
  const data = (error ?? {}) as { code?: string; params?: Record<string, unknown> };
  if (data.code) {
    const key = `pespo_clients.errors.${data.code}`;
    const message = t(key, data.params ?? {});
    if (message !== key) return message;
  }
  return t("common.something_went_wrong");
}
