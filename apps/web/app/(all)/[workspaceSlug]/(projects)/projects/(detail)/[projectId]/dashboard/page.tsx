/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EUserProjectRoles } from "@plane/types";
// components
import { PageHead } from "@/components/core/page-title";
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
import { ProjectPiecesPanel } from "@/components/projects/pieces-panel/root";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import type { Route } from "./+types/page";

function ProjectPiecesPanelPage({ params }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = params;
  const router = useAppRouter();
  const { currentProjectDetails } = useProject();
  const { allowPermissions } = useUserPermissions();
  const hasAdminLevelPermission = allowPermissions([EUserProjectRoles.ADMIN], EUserPermissionsLevel.PROJECT);
  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails.name} - ${t("pieces_panel.title")}`
    : t("pieces_panel.title");

  // Pespo: a aba "Peças" é uma funcionalidade do projeto, como ciclos e páginas.
  if (currentProjectDetails?.pieces_view === false)
    return (
      <div className="flex h-full w-full items-center justify-center">
        <DetailedEmptyState
          title={t("disabled_project.empty_state.pieces.title")}
          description={t("disabled_project.empty_state.pieces.description")}
          primaryButton={{
            text: t("disabled_project.empty_state.pieces.primary_button.text"),
            onClick: () => router.push(`/${workspaceSlug}/settings/projects/${projectId}/features/pieces`),
            disabled: !hasAdminLevelPermission,
          }}
        />
      </div>
    );

  return (
    <>
      <PageHead title={pageTitle} />
      <ProjectPiecesPanel workspaceSlug={workspaceSlug} projectId={projectId} />
    </>
  );
}

export default observer(ProjectPiecesPanelPage);
