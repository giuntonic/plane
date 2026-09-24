/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import React from "react";
import { observer } from "mobx-react";
import { RefreshCw } from "lucide-react";
// types
import type { TNameDescriptionLoader } from "@plane/types";

type Props = {
  isSubmitting: TNameDescriptionLoader;
};

export const NameDescriptionUpdateStatus = observer(function NameDescriptionUpdateStatus(props: Props) {
  const { t } = useTranslation();
  const { isSubmitting } = props;

  return (
    <>
      <div
        className={`flex items-center gap-x-2 transition-all duration-300 ${
          isSubmitting === "saved" ? "fade-out" : "fade-in"
        }`}
      >
        {isSubmitting !== "submitted" && isSubmitting !== "saved" && (
          <RefreshCw className="size-3.5 animate-spin stroke-tertiary" />
        )}
        <span className="text-13 text-tertiary">{isSubmitting === "submitting" ? t("ui.saving") : t("ui.saved")}</span>
      </div>
    </>
  );
});
