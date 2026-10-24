/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Shapes } from "lucide-react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { useParams } from "next/navigation";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/components/breadcrumbs/common";
// hooks
import { useProject } from "@/hooks/store/use-project";

// Pespo: cabeçalho do painel de peças (antes, do embed do Metabase).
export const ProjectPiecesPanelHeader = observer(function ProjectPiecesPanelHeader() {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const { loader: currentProjectDetailsLoader } = useProject();

  return (
    <Header>
      <Header.LeftItem>
        <div className="flex flex-grow items-center gap-4">
          <Breadcrumbs isLoading={currentProjectDetailsLoader === "init-loader"}>
            <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label={t("pieces_panel.title")}
                  href={`/${workspaceSlug}/projects/${projectId}/dashboard/`}
                  icon={<Shapes className="h-4 w-4 text-tertiary" />}
                  isLast
                />
              }
              isLast
            />
          </Breadcrumbs>
        </div>
      </Header.LeftItem>
    </Header>
  );
});
