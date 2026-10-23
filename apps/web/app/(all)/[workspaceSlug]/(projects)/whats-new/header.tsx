/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Sparkles } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";

export const WorkspaceReleaseNotesHeader = observer(function WorkspaceReleaseNotesHeader() {
  const { t } = useTranslation();
  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink label={t("release_notes.title")} icon={<Sparkles className="size-4 text-tertiary" />} />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );
});
