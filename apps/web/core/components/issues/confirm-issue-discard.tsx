/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { useState } from "react";
// ui
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  onDiscard: () => void;
  onConfirm: () => Promise<void>;
};

export function ConfirmIssueDiscard(props: Props) {
  const { t } = useTranslation();
  const { isOpen, handleClose, onDiscard, onConfirm } = props;

  const [isLoading, setIsLoading] = useState(false);

  const onClose = () => {
    handleClose();
    setIsLoading(false);
  };

  const handleDeletion = async () => {
    setIsLoading(true);
    await onConfirm();
    setIsLoading(false);
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
        <div className="sm:flex sm:items-start">
          <div className="mt-3 text-center sm:mt-0 sm:text-left">
            <h3 className="text-16 leading-6 font-medium text-primary">{t("ui.save_this_draft")}</h3>
            <div className="mt-2">
              <p className="text-13 text-secondary">{t("ui.jsx_you_can_save_this_work_item_to")} </p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-between gap-2 p-4 sm:px-6">
        <div>
          <Button variant="secondary" onClick={onDiscard}>
            {t("discard")}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" onClick={handleDeletion} loading={isLoading}>
            {isLoading ? t("saving") : t("save_to_drafts")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
