/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Pespo: Acervo da peça no Nextcloud (arquivos.pespo.com.br). `upload` = só envio (Recebido/), `delivery` = leitura (Entrega/). */
export type TAcervoLinkKind = "upload" | "delivery";

export type TAcervoLink = {
  id: string;
  kind: TAcervoLinkKind;
  url: string;
  expires_on: string | null;
  is_active: boolean;
  created_at: string;
  /** Só para a equipe: a pasta do link no app Arquivos. */
  files_url?: string;
};

export type TAcervoFile = {
  name: string;
  size: number;
  modified: string | null;
  is_folder: boolean;
};

/** …/issues/<id>/acervo/: o cliente (convidado) recebe só os links ativos e nunca a pasta. */
export type TIssueAcervo = {
  enabled: boolean;
  is_team: boolean;
  folder: { path: string; files_url: string } | null;
  links: TAcervoLink[];
  received: TAcervoFile[];
  delivery: TAcervoFile[];
  /** O Nextcloud não respondeu: os links vêm do Hub, as listas de arquivos vêm vazias. */
  unavailable: boolean;
};

export type TProjectAcervo = {
  enabled: boolean;
  folder: string;
  files_url: string | null;
  default_folder: string;
};

export type TAcervoBrowse = {
  path: string;
  parent: string | null;
  /** A pasta pode ser a do projeto (não pode ser a raiz do Acervo). */
  selectable: boolean;
  folders: { name: string; path: string }[];
};
