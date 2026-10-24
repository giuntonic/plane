/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable } from "mobx";
import type { TEntityTemplateKind } from "@plane/types";

// Pespo: um único modal "Salvar como modelo" fica montado no workspace (WorkspaceLevelModals); os
// menus de item, módulo, ciclo, página e projeto só pedem para abrir com a entidade de origem.

export type TSaveTemplateRequest = {
  kind: TEntityTemplateKind;
  sourceId: string;
  sourceName: string;
};

class SaveTemplateModalStore {
  request: TSaveTemplateRequest | null = null;

  constructor() {
    makeObservable(this, { request: observable.ref, open: action, close: action });
  }

  open = (request: TSaveTemplateRequest) => {
    this.request = request;
  };

  close = () => {
    this.request = null;
  };
}

export const saveTemplateModalStore = new SaveTemplateModalStore();
export const openSaveTemplateModal = (request: TSaveTemplateRequest) => saveTemplateModalStore.open(request);
