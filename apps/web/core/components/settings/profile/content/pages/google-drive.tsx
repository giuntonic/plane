/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { GOOGLE_DRIVE_STATUS_SWR_KEY } from "@/components/integration/google-drive/picker-modal";
import { ProfileSettingsHeading } from "@/components/settings/profile/heading";
// services
import { googleDriveService } from "@/services/google-drive.service";

// Pespo: conexão pessoal com o Google Drive (mesmo client OAuth do Google Calendar).
export const GoogleDriveProfileSettings = observer(function GoogleDriveProfileSettings() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const { data: status, mutate, isLoading } = useSWR(GOOGLE_DRIVE_STATUS_SWR_KEY, () => googleDriveService.status());

  useEffect(() => {
    const result = searchParams.get("google_drive");
    if (!result) return;

    if (result === "connected") {
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("google_drive_integration.connected_title") });
      void mutate();
    } else if (result === "not_configured") {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("google_drive_integration.not_configured") });
    } else {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("common.something_went_wrong") });
    }
    router.replace("/settings/profile/google-drive/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await googleDriveService.disconnect();
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("google_drive_integration.disconnected") });
      await mutate();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("common.something_went_wrong") });
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (isLoading || !status) return null;

  return (
    <div className="size-full">
      <ProfileSettingsHeading
        title={t("google_drive_integration.title")}
        description={t("google_drive_integration.description")}
      />
      <div className="mt-7 flex max-w-lg flex-col gap-5">
        {!status.connected ? (
          <Button
            variant="primary"
            className="self-start"
            onClick={() => (window.location.href = googleDriveService.getConnectUrl())}
          >
            {t("google_drive_integration.connect")}
          </Button>
        ) : (
          <>
            <div className="text-body-md text-secondary">
              {t("google_drive_integration.connected_as", { email: status.google_email })}
            </div>
            <div>
              <Button variant="error-outline" onClick={handleDisconnect} loading={isDisconnecting}>
                {t("google_drive_integration.disconnect")}
              </Button>
            </div>
          </>
        )}
        <p className="text-body-sm text-tertiary">{t("google_drive_integration.how_it_works")}</p>
      </div>
    </div>
  );
});
