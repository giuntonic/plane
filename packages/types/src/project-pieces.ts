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
