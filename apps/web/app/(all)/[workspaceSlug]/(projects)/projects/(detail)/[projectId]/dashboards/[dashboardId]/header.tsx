/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
// plane imports
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { CommonProjectBreadcrumbs } from "@/components/breadcrumbs/common";
// hooks
import { useDashboards } from "@/hooks/store/use-dashboards";

export const ProjectDashboardDetailHeader = observer(function ProjectDashboardDetailHeader() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug.toString();
  const projectId = params.projectId.toString();
  const dashboardId = params.dashboardId?.toString();
  const { getDashboardById } = useDashboards();
  const dashboard = dashboardId ? getDashboardById(dashboardId) : undefined;

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug} projectId={projectId} />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                href={`/${workspaceSlug}/projects/${projectId}/dashboards/`}
                label="Dashboard"
                icon={<LayoutDashboard className="h-4 w-4 text-tertiary" />}
              />
            }
          />
          {dashboard && <Breadcrumbs.Item component={<BreadcrumbLink label={dashboard.name} />} />}
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );
});
