/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
// plane package imports
import { Loader } from "@plane/ui";
// components
import { DashboardGrid } from "@/components/dashboards/dashboard-grid";
import { PageHead } from "@/components/core/page-title";
// hooks
import { useDashboards } from "@/hooks/store/use-dashboards";
import type { Route } from "./+types/page";

function WorkspaceDashboardDetailPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, dashboardId } = params;
  const { getDashboardById, fetchDashboardDetails } = useDashboards();

  const { isLoading } = useSWR(`dashboard-details-${workspaceSlug}-${dashboardId}`, () =>
    fetchDashboardDetails(workspaceSlug, dashboardId)
  );

  const dashboard = getDashboardById(dashboardId);

  return (
    <>
      <PageHead title={dashboard?.name} />
      {isLoading && !dashboard ? (
        <Loader className="h-full w-full p-6">
          <Loader.Item height="100%" width="100%" />
        </Loader>
      ) : dashboard ? (
        <DashboardGrid dashboard={dashboard} workspaceSlug={workspaceSlug} />
      ) : null}
    </>
  );
}

export default observer(WorkspaceDashboardDetailPage);
