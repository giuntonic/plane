/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable } from "mobx";

// Pespo: duas preferências das propriedades do item, lembradas neste navegador.
// - isHidden: esconde a coluna de propriedades da página cheia do item e do painel em tela cheia (botão no
//   cabeçalho). No celular a página cheia segue o comportamento do upstream (a barra fica escondida).
// - isCollapsed: recolhe a seção "Propriedades" do painel lateral e do modal, onde ela fica no meio do
//   conteúdo (seta ao lado do título).

const HIDDEN_KEY = "pespo-hub:work-item-properties-hidden";
const COLLAPSED_KEY = "pespo-hub:work-item-properties-collapsed";

const readFlag = (key: string) => {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

const writeFlag = (key: string, value: boolean) => {
  try {
    if (value) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // sem localStorage (janela privada etc.): vale só nesta aba
  }
};

class WorkItemPropertiesPanelStore {
  isHidden = false;
  isCollapsed = false;

  constructor() {
    makeObservable(this, {
      isHidden: observable.ref,
      isCollapsed: observable.ref,
      toggle: action,
      toggleCollapsed: action,
    });
    if (typeof window !== "undefined") {
      this.isHidden = readFlag(HIDDEN_KEY);
      this.isCollapsed = readFlag(COLLAPSED_KEY);
    }
  }

  toggle = () => {
    this.isHidden = !this.isHidden;
    writeFlag(HIDDEN_KEY, this.isHidden);
  };

  toggleCollapsed = () => {
    this.isCollapsed = !this.isCollapsed;
    writeFlag(COLLAPSED_KEY, this.isCollapsed);
  };
}

export const workItemPropertiesPanelStore = new WorkItemPropertiesPanelStore();
