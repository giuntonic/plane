/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LayoutDashboard, Plus } from "lucide-react";
import useSWR from "swr";
// plane package imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { Loader } from "@plane/ui";
import type { TDashboardScope } from "@plane/types";
// hooks
import { useDashboards } from "@/hooks/store/use-dashboards";
// plane web components
import { CreateDashboardModal } from "./create-dashboard-modal";

type Props = {
  dashboardType: TDashboardScope;
  projectId?: string;
};

export const DashboardsList = observer(function DashboardsList(props: Props) {
  const { dashboardType, projectId } = props;
  const params = useParams();
  const workspaceSlug = params.workspaceSlug.toString();
  const { fetchDashboards, getDashboardsByScope } = useDashboards();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { t } = useTranslation();

  const { isLoading } = useSWR(`dashboards-${workspaceSlug}-${dashboardType}-${projectId}`, () =>
    fetchDashboards(workspaceSlug, { dashboard_type: dashboardType, project_id: projectId })
  );

  const dashboards = getDashboardsByScope(workspaceSlug, dashboardType, projectId);
  const basePath = projectId
    ? `/${workspaceSlug}/projects/${projectId}/dashboards`
    : dashboardType === "home"
      ? `/${workspaceSlug}/my-dashboards`
      : `/${workspaceSlug}/dashboards`;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="flex items-center justify-between pb-6">
        <h2 className="text-18 font-medium text-primary">{t("sidebar.dashboards")}</h2>
        <Button
          variant="primary"
          size="sm"
          prependIcon={<Plus className="size-3.5" />}
          onClick={() => setIsCreateModalOpen(true)}
        >
          {t("native_dashboards.new")}
        </Button>
      </div>

      {isLoading ? (
        <Loader className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Loader.Item height="120px" />
          <Loader.Item height="120px" />
          <Loader.Item height="120px" />
        </Loader>
      ) : dashboards && dashboards.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboards.map((dashboard) => (
            <Link
              key={dashboard.id}
              href={`${basePath}/${dashboard.id}/`}
              className="flex flex-col gap-2 rounded-md border border-subtle p-4 hover:bg-surface-1"
            >
              <div className="flex items-center gap-2">
                <LayoutDashboard className="size-4 text-tertiary" />
                <span className="truncate text-14 font-medium text-primary">{dashboard.name}</span>
              </div>
              <span className="text-13 text-tertiary">{t("native_dashboards.widget_count", { count: dashboard.widgets?.length ?? 0 })}</span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyStateCompact
          assetKey="unknown"
          assetClassName="size-20"
          rootClassName="flex-1 border border-dashed border-subtle rounded-md"
          title={t("native_dashboards.empty")}
        />
      )}

      <CreateDashboardModal
        isOpen={isCreateModalOpen}
        handleClose={() => setIsCreateModalOpen(false)}
        workspaceSlug={workspaceSlug}
        dashboardType={dashboardType}
        projectId={projectId}
      />
    </div>
  );
});
