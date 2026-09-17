/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { PageHead } from "@/components/core/page-title";
import { DashboardsList } from "@/components/dashboards/dashboards-list";

function WorkspaceDashboardsPage() {
  return (
    <>
      <PageHead title="Dashboards" />
      <DashboardsList dashboardType="workspace" />
    </>
  );
}

export default WorkspaceDashboardsPage;
