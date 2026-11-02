/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: Configurações › Clientes › um cliente (contrato, renovação, logins e histórico).
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { PespoClientDetail } from "@/components/pespo-clients/detail";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { useUserPermissions } from "@/hooks/store/user";
import { ClientsWorkspaceSettingsHeader } from "../header";

function ClientDetailSettingsPage() {
  const { workspaceSlug, clientId } = useParams();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { t } = useTranslation();
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  if (workspaceUserInfo && !isAdmin) return <NotAuthorizedView section="settings" className="h-auto" />;

  return (
    <SettingsContentWrapper header={<ClientsWorkspaceSettingsHeader />}>
      <PageHead title={t("pespo_clients.title")} />
      <PespoClientDetail workspaceSlug={workspaceSlug?.toString() ?? ""} clientId={clientId?.toString() ?? ""} />
    </SettingsContentWrapper>
  );
}

export default observer(ClientDetailSettingsPage);
