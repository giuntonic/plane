/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { DashboardIcon } from "@plane/propel/icons";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/components/breadcrumbs/common";
// hooks
import { useProject } from "@/hooks/store/use-project";

export const ProjectDashboardEmbedHeader = observer(function ProjectDashboardEmbedHeader() {
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
                  label="Dashboard"
                  href={`/${workspaceSlug}/projects/${projectId}/dashboard/`}
                  icon={<DashboardIcon className="h-4 w-4 text-tertiary" />}
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
