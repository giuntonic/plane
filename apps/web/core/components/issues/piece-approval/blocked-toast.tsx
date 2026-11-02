/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: o aviso de "ainda não dá pra aprovar", com os itens que faltam concluir (ver helpers.ts).
import { useEffect } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TApprovalBlockedPayload } from "./helpers";
import { APPROVAL_BLOCKED_EVENT } from "./helpers";

const MAX_LISTED = 3;

export function PieceApprovalBlockedToast() {
  const { t } = useTranslation();

  useEffect(() => {
    const onBlocked = (event: Event) => {
      const blockers = (event as CustomEvent<TApprovalBlockedPayload>).detail?.blockers ?? [];
      const listed = blockers
        .slice(0, MAX_LISTED)
        .map((blocker) => `${blocker.project_identifier}-${blocker.sequence_id} ${blocker.name}`)
        .join("; ");
      const rest = blockers.length - MAX_LISTED;
      setToast({
        type: TOAST_TYPE.WARNING,
        title: t("piece_approval.blocked.title"),
        message:
          rest > 0
            ? t("piece_approval.blocked.message_more", { items: listed, count: rest })
            : t("piece_approval.blocked.message", { items: listed }),
      });
    };
    window.addEventListener(APPROVAL_BLOCKED_EVENT, onBlocked);
    return () => window.removeEventListener(APPROVAL_BLOCKED_EVENT, onBlocked);
  }, [t]);

  return null;
}
