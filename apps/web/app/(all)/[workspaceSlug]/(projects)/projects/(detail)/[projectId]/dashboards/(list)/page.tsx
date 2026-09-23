/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// components
import { PageHead } from "@/components/core/page-title";
import { DashboardsList } from "@/components/dashboards/dashboards-list";

function ProjectDashboardPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();

  return (
    <>
      <PageHead title={t("sidebar.dashboards")} />
      <DashboardsList dashboardType="project" projectId={projectId.toString()} />
    </>
  );
}

export default observer(ProjectDashboardPage);
