/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { TimeReportRoot } from "@/components/time-tracking/report";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";

function WorkspaceTimeReportPage() {
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("time_tracking.report.title")}`
    : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <TimeReportRoot />
    </>
  );
}

export default observer(WorkspaceTimeReportPage);
