/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: os títulos de ordenação das colunas ("New → Old", "None → Urgent") vêm das constantes em inglês.
// Traduz pelo i18n; "A" e "Z" e o que não tiver tradução ficam como estão.
export const translateSortOrderTitle = (t: (key: string) => string, title: string): string => {
  const key = `ui.sort_order_title.${title.toLowerCase()}`;
  const translated = t(key);
  return translated && translated !== key ? translated : title;
};
