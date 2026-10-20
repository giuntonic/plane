/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
// types
import { useTranslation } from "@plane/i18n";
import type { TIssue } from "@plane/types";
// ui
import { AlertModalCore } from "@plane/ui";
// hooks

type Props = {
  data: Partial<TIssue>;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
};

export function DeclineIssueModal(props: Props) {
  const { isOpen, onClose, data, onSubmit } = props;
  // states
  const [isDeclining, setIsDeclining] = useState(false);
  // store hooks
  const { t } = useTranslation();

  const handleClose = () => {
    setIsDeclining(false);
    onClose();
  };

  const handleDecline = async () => {
    setIsDeclining(true);
    await onSubmit().finally(() => setIsDeclining(false));
  };

  return (
    <AlertModalCore
      handleClose={handleClose}
      handleSubmit={handleDecline}
      isSubmitting={isDeclining}
      isOpen={isOpen}
      title={t("inbox_issue.modals.decline.title")}
      // TODO: Need to translate the confirmation message
      content={
        <>
          {t("ui.jsx_are_you_sure_you_want_to_decline")}{" "}
          <span className="font-medium break-words text-primary">{data?.name}</span>
          {""}
          {t("ui.jsx_this_action_cannot_be_undone")}
        </>
      }
      primaryButtonText={{
        loading: t("declining"),
        default: t("decline"),
      }}
    />
  );
}
