/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense } from "react";
import { observer } from "mobx-react";

const ProfileSettingsModal = lazy(() =>
  import("@/components/settings/profile/modal").then((module) => ({
    default: module.ProfileSettingsModal,
  }))
);

// Pespo: seletor do Google Drive aberto pelo embed do editor (pickGoogleDriveFile).
const GoogleDrivePickerHost = lazy(() =>
  import("@/components/integration/google-drive/picker-host").then((module) => ({
    default: module.GoogleDrivePickerHost,
  }))
);

type TGlobalModalsProps = {
  workspaceSlug: string;
};

/**
 * GlobalModals component manages all workspace-level modals across Plane applications.
 *
 * This includes:
 * - Profile settings modal
 * - Google Drive picker (Pespo)
 */
export const GlobalModals = observer(function GlobalModals(_props: TGlobalModalsProps) {
  return (
    <Suspense fallback={null}>
      <ProfileSettingsModal />
      <GoogleDrivePickerHost />
    </Suspense>
  );
});
