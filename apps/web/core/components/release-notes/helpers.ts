/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { PESPO_HUB_VERSION } from "./releases";

// Última versão cuja página de novidades a pessoa abriu, por navegador. Só serve para o ponto de
// "novo" no botão da versão: sem o storage (aba anônima, bloqueado), o ponto apenas não aparece.
const SEEN_VERSION_KEY = "pespo-hub:release-notes-seen";

export const hasSeenCurrentRelease = (): boolean => {
  try {
    return window.localStorage.getItem(SEEN_VERSION_KEY) === PESPO_HUB_VERSION;
  } catch {
    return true;
  }
};

export const markCurrentReleaseSeen = () => {
  try {
    window.localStorage.setItem(SEEN_VERSION_KEY, PESPO_HUB_VERSION);
  } catch {
    // sem storage, nada a lembrar
  }
};

/** "2026-10-23" -> data por extenso no idioma da pessoa, sem cair no dia anterior pelo fuso. */
export const formatReleaseDate = (date: string, locale: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

export const releaseAnchor = (version: string) => `v${version}`;
