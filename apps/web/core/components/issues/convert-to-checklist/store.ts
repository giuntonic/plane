/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable } from "mobx";

// Pespo: um único modal "Transformar em subtarefa" fica montado no workspace (WorkspaceLevelModals); os
// menus do item (lista, quadro, detalhe e sub-itens) só pedem para abrir com o item.

export type TConvertToChecklistRequest = {
  issueId: string;
  /** Item de destino já escolhido (ex.: o pai, no menu da lista de sub-itens). */
  targetIssueId?: string;
};

class ConvertToChecklistModalStore {
  request: TConvertToChecklistRequest | null = null;

  constructor() {
    makeObservable(this, { request: observable.ref, open: action, close: action });
  }

  open = (request: TConvertToChecklistRequest) => {
    this.request = request;
  };

  close = () => {
    this.request = null;
  };
}

export const convertToChecklistModalStore = new ConvertToChecklistModalStore();
export const openConvertToChecklistModal = (request: TConvertToChecklistRequest) =>
  convertToChecklistModalStore.open(request);
