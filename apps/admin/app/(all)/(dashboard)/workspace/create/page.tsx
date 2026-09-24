/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { i18nInstance, useTranslation } from "@plane/i18n";
import { observer } from "mobx-react";
// components
import { PageWrapper } from "@/components/common/page-wrapper";
// types
import type { Route } from "./+types/page";
// local
import { WorkspaceCreateForm } from "./form";

const WorkspaceCreatePage = observer(function WorkspaceCreatePage(_props: Route.ComponentProps) {
  const { t } = useTranslation();
  return (
    <PageWrapper
      header={{
        title: t("ui.create_a_new_workspace_on_this_instance"),
        description: t("ui.you_will_need_to_invite_users_from"),
      }}
    >
      <WorkspaceCreateForm />
    </PageWrapper>
  );
});

export const meta: Route.MetaFunction = () => [
  {
    get title() {
      return i18nInstance.t("ui.create_workspace_god_mode");
    },
  },
];

export default WorkspaceCreatePage;
