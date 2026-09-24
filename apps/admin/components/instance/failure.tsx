/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { observer } from "mobx-react";
import { useTheme } from "next-themes";
import { Button } from "@plane/propel/button";
// assets
import { AuthHeader } from "@/app/(all)/(home)/auth-header";
import InstanceFailureDarkImage from "@/app/assets/instance/instance-failure-dark.svg?url";
import InstanceFailureImage from "@/app/assets/instance/instance-failure.svg?url";

const handleRetry = () => {
  window.location.reload();
};

export const InstanceFailureView = observer(function InstanceFailureView() {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();

  const instanceImage = resolvedTheme === "dark" ? InstanceFailureDarkImage : InstanceFailureImage;

  return (
    <>
      <AuthHeader />
      <div className="mt-10 flex w-full flex-grow flex-col items-center justify-center py-6">
        <div className="relative flex w-full max-w-[22.5rem] flex-col gap-6">
          <div className="relative flex flex-col items-center justify-center space-y-4">
            <img src={instanceImage} alt={t("ui.instance_failure_illustration")} />
            <h3 className="text-center text-20 font-medium text-on-color">
              {t("ui.unable_to_fetch_instance_details")}
            </h3>
            <p className="text-center text-14 font-medium">{t("ui.jsx_we_were_unable_to_fetch_the_details")}</p>
          </div>
          <div className="flex justify-center">
            <Button size="lg" onClick={handleRetry}>
              {t("common.retry")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
});
