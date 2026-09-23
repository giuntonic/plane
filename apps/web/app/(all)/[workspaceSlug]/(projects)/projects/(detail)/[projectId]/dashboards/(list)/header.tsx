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
import { CommonProjectBreadcrumbs } from "@/components/breadcrumbs/common";

export const ProjectDashboardHeader = observer(function ProjectDashboardHeader() {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug.toString()} projectId={projectId.toString()} />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink label={t("sidebar.dashboards")} icon={<LayoutDashboard className="h-4 w-4 text-tertiary" />} />
            }
          />
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );
});
