/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CalendarDays } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";

export const WorkspaceCalendarSyncHeader = observer(function WorkspaceCalendarSyncHeader() {
  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={<BreadcrumbLink label="Calendário" icon={<CalendarDays className="h-4 w-4 text-tertiary" />} />}
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );
});
