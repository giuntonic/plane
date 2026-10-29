/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable } from "mobx";

// Pespo: esconder a coluna de propriedades na página cheia do item e no painel lateral em modo modal ou tela
// cheia. Uma preferência só, lembrada neste navegador. No celular a página cheia segue o comportamento do
// upstream (a barra fica escondida).

const STORAGE_KEY = "pespo-hub:work-item-properties-hidden";

const readHidden = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

class WorkItemPropertiesPanelStore {
  isHidden = false;

  constructor() {
    makeObservable(this, { isHidden: observable.ref, toggle: action });
    if (typeof window !== "undefined") this.isHidden = readHidden();
  }

  toggle = () => {
    this.isHidden = !this.isHidden;
    try {
      if (this.isHidden) window.localStorage.setItem(STORAGE_KEY, "1");
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // sem localStorage (janela privada etc.): vale só nesta aba
    }
  };
}

export const workItemPropertiesPanelStore = new WorkItemPropertiesPanelStore();
