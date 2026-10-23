/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueChecklistItem } from "@plane/types";
// components
import type { TChecklistTreeLabels, TChecklistTreeNode } from "@/components/checklist-tree";
import { ChecklistTreeList } from "@/components/checklist-tree";
// local imports
import { IssueChecklistItemExtras } from "./extras";
import { useIssueChecklistOperations } from "./helper";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

export const IssueChecklistCollapsibleContent = observer(function IssueChecklistCollapsibleContent(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const { t } = useTranslation();
  const operations = useIssueChecklistOperations(workspaceSlug, projectId, issueId);

  const labels: TChecklistTreeLabels = useMemo(
    () => ({
      placeholder: t("issue_checklist.placeholder"),
      addLine: t("issue_checklist.add_line"),
      addChild: t("issue_checklist.add_child"),
      delete: t("issue_checklist.delete"),
      expand: t("issue_checklist.expand"),
      collapse: t("issue_checklist.collapse"),
      drag: t("issue_checklist.drag"),
      hint: t("issue_checklist.hint"),
    }),
    [t]
  );

  const renderItemExtras = (item: TChecklistTreeNode) => (
    <IssueChecklistItemExtras
      item={item as TIssueChecklistItem}
      projectId={projectId}
      disabled={disabled}
      operations={operations}
    />
  );

  return (
    <ChecklistTreeList
      scopeId={issueId}
      disabled={disabled}
      operations={operations}
      labels={labels}
      renderItemExtras={renderItemExtras}
      className="px-1.5 pb-2"
    />
  );
});
