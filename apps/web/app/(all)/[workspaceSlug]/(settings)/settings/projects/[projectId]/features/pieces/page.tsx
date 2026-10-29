/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: liga e desliga a aba "Peças" (painel de peças do cliente), como as outras funcionalidades.
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { ProjectSettingsFeatureControlItem } from "@/components/settings/project/content/feature-control-item";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { FeaturesPiecesProjectSettingsHeader } from "./header";

function FeaturesPiecesSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentProjectDetails } = useProject();
  // translation
  const { t } = useTranslation();
  // derived values
  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails?.name} ${t("settings").toLowerCase()} - ${t("project_settings.features.pieces.short_title")}`
    : undefined;
  const canPerformProjectAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);

  if (workspaceUserInfo && !canPerformProjectAdminActions) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<FeaturesPiecesProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <section className="w-full">
        <SettingsHeading
          title={t("project_settings.features.pieces.title")}
          description={t("project_settings.features.pieces.description")}
        />
        <div className="mt-7">
          <ProjectSettingsFeatureControlItem
            title={t("project_settings.features.pieces.toggle_title")}
            description={t("project_settings.features.pieces.toggle_description")}
            featureProperty="pieces_view"
            projectId={projectId}
            value={!!currentProjectDetails?.pieces_view}
            workspaceSlug={workspaceSlug}
          />
        </div>
      </section>
    </SettingsContentWrapper>
  );
}

export default observer(FeaturesPiecesSettingsPage);
