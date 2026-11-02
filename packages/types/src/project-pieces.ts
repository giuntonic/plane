/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: painel de peças do projeto de um cliente (…/projects/<id>/pieces/).

export type TPieceCategory = "Post" | "Reels" | "Artigo" | "Anuncio";

export type TProjectPiecesPanel = {
  /** "no_client": projeto sem cliente no portal; "unavailable": banco do portal fora do ar. */
  contract_status: "ok" | "no_client" | "unavailable";
  client_name: string | null;
  contract: {
    type: "FEE" | "FEP" | string;
    start_date: string;
    end_date: string;
    urgent_limit: number;
    categories: { category: string; contracted: number }[];
  } | null;
  /** Contrato que vence em até 14 dias (ou já venceu). */
  expiring: { end_date: string; status: string; days_left: number } | null;
  availability: {
    categories: { category: string; contracted: number; used: number; available: number }[];
    urgent: { available: number; limit: number; open_now: number; max_simultaneous: number };
  };
  total_pieces: number;
  by_state_group: { group: "backlog" | "unstarted" | "started" | "completed" | "cancelled"; count: number }[];
  delivered_this_month: { id: string; name: string; category: string; completed_at: string }[];
  reworks: {
    total: number;
    internal: number;
    client: number;
    in_rework_now: { id: string; name: string; state: string }[];
    most_reworked: { id: string; name: string; count: number }[];
  };
};

// Pespo: Configurações do projeto › Contrato (…/projects/<id>/contract/), só leitura.
export type TProjectContractView = {
  /** De onde o Hub lê o contrato agora: o banco do portal (padrão) ou o que foi importado para o Hub. */
  source: "portal" | "hub";
  current_status: "ok" | "no_client" | "unavailable";
  /** O contrato que o painel de peças, o pedido de peças e o relatório do mês usam. */
  current: {
    client_name: string;
    contract: TProjectPiecesPanel["contract"];
    expiring: TProjectPiecesPanel["expiring"];
  } | null;
  /** O que já foi importado do portal para o Hub, com o histórico. */
  hub: {
    client: { id: string; name: string; portal_client_id: string | null };
    contracts: {
      id: string;
      contract_type: string;
      start_date: string;
      end_date: string;
      status: "active" | "renewed" | "expired";
      urgent_limit: number;
      expiry_notice_sent_at: string | null;
      categories: { category: string; contracted: number }[];
    }[];
    imported_at: string;
  } | null;
};

export type TPieceRequestItem = {
  category: TPieceCategory;
  quantity: number;
  urgent?: boolean;
  needs_print?: boolean;
  /** "YYYY-MM-DD" */
  desired_date?: string | null;
};

export type TPieceRequestErrorCode =
  | "INVALID_ITEMS"
  | "EMPTY_REQUEST"
  | "TOO_MANY_PIECES"
  | "NO_ACTIVE_CONTRACT"
  | "NOT_ENOUGH"
  | "NOT_ENOUGH_URGENT"
  | "PROJECT_NOT_READY"
  | "PORTAL_UNAVAILABLE"
  | "REWORK_STATE_MISSING"
  | "REASON_REQUIRED";

export type TPieceRequestError = {
  code: TPieceRequestErrorCode;
  params: Record<string, string | number>;
};
