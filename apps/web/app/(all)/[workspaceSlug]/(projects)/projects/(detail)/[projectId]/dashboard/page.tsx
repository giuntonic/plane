/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
import { DashboardIcon } from "@plane/propel/icons";
import { Loader } from "@plane/ui";
// components
import { PageHead } from "@/components/core/page-title";
// services
import projectMetabaseService from "@/services/project-metabase.service";
// hooks
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

function ProjectDashboardEmbedPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { currentProjectDetails } = useProject();

  const { data, isLoading } = useSWR(
    workspaceSlug && projectId ? `PROJECT_METABASE_EMBED_${workspaceSlug}_${projectId}` : null,
    () => projectMetabaseService.fetchEmbed(workspaceSlug, projectId)
  );

  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails.name} - Dashboard` : "Dashboard";

  return (
    <div className="flex h-full flex-col">
      <PageHead title={pageTitle} />
      <div className="h-full w-full overflow-hidden">
        {isLoading ? (
          <Loader className="flex h-full flex-col gap-3 p-9">
            <Loader.Item height="200px" width="100%" />
            <Loader.Item height="200px" width="100%" />
          </Loader>
        ) : data?.configured && data.url ? (
          <iframe
            key={data.url}
            src={data.url}
            title="Dashboard"
            className="h-full w-full border-0"
            allowTransparency
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
            <DashboardIcon className="size-10 text-tertiary" />
            <p className="text-16 font-medium text-primary">Nenhum dashboard configurado</p>
            <p className="max-w-90 text-13 text-tertiary">
              Esse projeto ainda não tem um dashboard do Metabase vinculado. Fale com o administrador do workspace
              pra configurar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default observer(ProjectDashboardEmbedPage);
