/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { ReleaseNotesRoot } from "@/components/release-notes";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";

function WorkspaceReleaseNotesPage() {
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - ${t("release_notes.title")}` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <ReleaseNotesRoot />
    </>
  );
}

export default observer(WorkspaceReleaseNotesPage);
