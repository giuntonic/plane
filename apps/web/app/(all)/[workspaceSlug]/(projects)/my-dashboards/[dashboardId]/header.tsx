/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
import { useDashboards } from "@/hooks/store/use-dashboards";

export const MyDashboardDetailHeader = observer(function MyDashboardDetailHeader() {
  const { t } = useTranslation();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug.toString();
  const dashboardId = params.dashboardId?.toString();
  const { getDashboardById } = useDashboards();
  const dashboard = dashboardId ? getDashboardById(dashboardId) : undefined;

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                href={`/${workspaceSlug}/my-dashboards/`}
                label={t("sidebar.my_dashboards")}
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
