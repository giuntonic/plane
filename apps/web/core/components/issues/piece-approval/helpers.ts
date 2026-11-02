/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: o Hub recusa mudar uma peça para "Aprovada - Pronta pra Ativar" enquanto ela ainda está bloqueada por um
// item aberto (400 APPROVAL_BLOCKED, com a lista do que falta). O interceptor do APIService avisa por este evento,
// e o PieceApprovalBlockedToast mostra o motivo. Quem já mostra um toast genérico de erro ao salvar pula o seu
// quando o erro é esse, para não aparecerem dois.

export const APPROVAL_BLOCKED_EVENT = "pespo:approval-blocked";

export type TApprovalBlocker = {
  id: string;
  name: string;
  sequence_id: number;
  project_identifier: string;
};

export type TApprovalBlockedPayload = {
  error: "APPROVAL_BLOCKED";
  blockers: TApprovalBlocker[];
};

export const isApprovalBlockedError = (error: unknown): error is TApprovalBlockedPayload =>
  !!error && typeof error === "object" && (error as { error?: unknown }).error === "APPROVAL_BLOCKED";

export const notifyApprovalBlocked = (payload: TApprovalBlockedPayload) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<TApprovalBlockedPayload>(APPROVAL_BLOCKED_EVENT, { detail: payload }));
};
