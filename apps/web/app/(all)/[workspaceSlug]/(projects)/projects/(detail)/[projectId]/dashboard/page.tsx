/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { ProjectPiecesPanel } from "@/components/projects/pieces-panel/root";
// hooks
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

function ProjectPiecesPanelPage({ params }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = params;
  const { currentProjectDetails } = useProject();
  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails.name} - ${t("pieces_panel.title")}`
    : t("pieces_panel.title");

  return (
    <>
      <PageHead title={pageTitle} />
      <ProjectPiecesPanel workspaceSlug={workspaceSlug} projectId={projectId} />
    </>
  );
}

export default observer(ProjectPiecesPanelPage);
