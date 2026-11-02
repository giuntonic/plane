/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { ReportsRoot } from "@/components/time-tracking/report";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";

function WorkspaceReportsPage() {
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - ${t("pespo_reports.title")}` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <ReportsRoot />
    </>
  );
}

export default observer(WorkspaceReportsPage);
