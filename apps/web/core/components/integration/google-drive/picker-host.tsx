/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useSyncExternalStore } from "react";
import { useSWRConfig } from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// local imports
import { getPendingGoogleDrivePick, setPendingGoogleDrivePick, subscribeGoogleDrivePick } from "./picker-store";
import { GOOGLE_DRIVE_STATUS_SWR_KEY, GoogleDrivePickerModal } from "./picker-modal";

// Pespo: renderiza o seletor pedido via pickGoogleDriveFile (ver picker-store.ts).
export function GoogleDrivePickerHost() {
  const { t } = useTranslation();
  const { mutate } = useSWRConfig();
  const current = useSyncExternalStore(subscribeGoogleDrivePick, getPendingGoogleDrivePick, () => null);

  // Result of the OAuth round-trip started from the picker (the settings page
  // handles its own).
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("google_drive");
    if (!result || url.pathname.startsWith("/settings/profile/google-drive")) return;
    if (result === "connected") {
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("google_drive_integration.connected_title") });
      void mutate(GOOGLE_DRIVE_STATUS_SWR_KEY);
    } else {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t(
          result === "not_configured"
            ? "google_drive_integration.not_configured"
            : "google_drive_integration.errors.generic"
        ),
      });
    }
    url.searchParams.delete("google_drive");
    window.history.replaceState(window.history.state, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GoogleDrivePickerModal
      isOpen={!!current}
      allowCreate={current?.allowCreate}
      onClose={() => {
        current?.resolve(null);
        setPendingGoogleDrivePick(null);
      }}
      onSelect={(file) => {
        current?.resolve(file);
        setPendingGoogleDrivePick(null);
      }}
    />
  );
}
