/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: Configurações › Clientes (só admins): a lista e o "Novo cliente", no lugar do painel admin.
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { PespoClientsList } from "@/components/pespo-clients/list";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import { ClientsWorkspaceSettingsHeader } from "./header";

function ClientsSettingsPage() {
  const { workspaceSlug } = useParams();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - ${t("pespo_clients.title")}` : undefined;

  if (workspaceUserInfo && !isAdmin) return <NotAuthorizedView section="settings" className="h-auto" />;

  return (
    <SettingsContentWrapper header={<ClientsWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="flex w-full flex-col gap-y-6">
        <SettingsHeading title={t("pespo_clients.title")} description={t("pespo_clients.description")} />
        <PespoClientsList workspaceSlug={workspaceSlug?.toString() ?? ""} />
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(ClientsSettingsPage);
