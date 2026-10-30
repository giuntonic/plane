/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, TextArea } from "@plane/ui";
import { pieceErrorMessage } from "@/components/projects/pieces-panel/helpers";
// services
import { projectPiecesService } from "@/services/project-pieces.service";
// local imports
import type { TVersionDecision } from "./types";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  decision: TVersionDecision | null;
  /** Aprovar e pedir refação só na versão mais nova. */
  isLatest: boolean;
  canReview: boolean;
  onApprove: () => Promise<void>;
  onReworkRequested: () => Promise<void>;
};

/** Aprovação e pedido de refação da versão. Os dois viram comentários de texto fixo, que o n8n
 * ("Peça Aprovada") e o painel de peças leem; a versão de cada decisão é a mais nova naquele momento. */
export function ReviewDecisionBar(props: Props) {
  const { workspaceSlug, projectId, issueId, decision, isLatest, canReview, onApprove, onReworkRequested } = props;
  const { t } = useTranslation();
  const [approving, setApproving] = useState(false);
  const [reworkOpen, setReworkOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  const approve = async () => {
    setApproving(true);
    try {
      await onApprove();
    } finally {
      setApproving(false);
    }
  };

  const requestRework = async () => {
    if (!reason.trim()) return;
    setSending(true);
    try {
      await projectPiecesService.requestRework(workspaceSlug, projectId, issueId, reason.trim());
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("pieces_panel.rework.success") });
      setReworkOpen(false);
      setReason("");
      await onReworkRequested();
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("pieces_panel.rework.error"), message: pieceErrorMessage(t, error) });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {decision?.kind === "approved" && (
        <div className="flex items-center gap-2 rounded-md border border-success-subtle bg-success-subtle px-3 py-2 text-13 text-secondary">
          <CheckCircle2 className="size-4 shrink-0 text-success-primary" />
          <span>{t("media_review.approved_by", { name: decision.author, date: decision.date })}</span>
        </div>
      )}
      {decision?.kind === "rework" && (
        <div className="flex items-start gap-2 rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2 text-13 text-secondary">
          <RotateCcw className="mt-0.5 size-4 shrink-0 text-warning-primary" />
          <span>
            {t("media_review.rework_by", { name: decision.author, date: decision.date })}
            {decision.reason && <span className="block text-tertiary">{decision.reason}</span>}
          </span>
        </div>
      )}
      {canReview && isLatest && decision?.kind !== "approved" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => void approve()} loading={approving} disabled={approving}>
            {t("media_review.approve")}
          </Button>
          <Button variant="neutral-primary" size="sm" onClick={() => setReworkOpen((open) => !open)}>
            {t("pieces_panel.rework.button")}
          </Button>
        </div>
      )}
      {reworkOpen && (
        <div className="flex flex-col gap-2 rounded-md border border-subtle p-2">
          <TextArea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("pieces_panel.rework.placeholder")}
            className="min-h-16 w-full resize-none text-13"
          />
          <div className="flex justify-end gap-2">
            <Button variant="neutral-primary" size="sm" onClick={() => setReworkOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void requestRework()}
              loading={sending}
              disabled={!reason.trim() || sending}
            >
              {t("pieces_panel.rework.submit")}
            </Button>
          </div>
        </div>
      )}
      {canReview && !isLatest && <p className="text-12 text-tertiary">{t("media_review.latest_only")}</p>}
    </div>
  );
}
