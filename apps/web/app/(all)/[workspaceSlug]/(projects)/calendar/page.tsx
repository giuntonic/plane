/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
import { WorkspaceCalendarSyncRoot } from "@/components/workspace/calendar-sync";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";

function WorkspaceCalendarSyncPage() {
  const { currentWorkspace } = useWorkspace();
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Calendário` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <WorkspaceCalendarSyncRoot />
    </>
  );
}

export default observer(WorkspaceCalendarSyncPage);
