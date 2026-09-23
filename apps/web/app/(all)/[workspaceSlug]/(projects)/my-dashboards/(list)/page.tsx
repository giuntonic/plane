/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { PageHead } from "@/components/core/page-title";
import { DashboardsList } from "@/components/dashboards/dashboards-list";

function MyDashboardsPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHead title={t("sidebar.my_dashboards")} />
      <DashboardsList dashboardType="home" />
    </>
  );
}

export default MyDashboardsPage;
