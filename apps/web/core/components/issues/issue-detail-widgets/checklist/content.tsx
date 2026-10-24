/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { ListPlus } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueChecklistItem } from "@plane/types";
// components
import type { TChecklistTreeLabels, TChecklistTreeNode } from "@/components/checklist-tree";
import { ChecklistTreeList } from "@/components/checklist-tree";
// local imports
import { IssueChecklistItemExtras } from "./extras";
import { useIssueChecklistOperations, useIssueNamedChecklistOperations, useIssueNamedChecklists } from "./helper";
import { IssueNamedChecklist } from "./named-checklist";

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
  // Pespo: checklists com nome, embaixo da lista padrão ("Subtarefas").
  const { data: namedChecklists = [] } = useIssueNamedChecklists(workspaceSlug, projectId, issueId);
  const namedOperations = useIssueNamedChecklistOperations(workspaceSlug, projectId, issueId);

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
    <div className="flex flex-col">
      <ChecklistTreeList
        scopeId={issueId}
        disabled={disabled}
        operations={operations}
        labels={labels}
        renderItemExtras={renderItemExtras}
        className="px-1.5 pb-2"
      />
      {namedChecklists.map((checklist) => (
        <IssueNamedChecklist
          key={checklist.id}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          checklist={checklist}
          disabled={disabled}
          labels={labels}
          onRename={(name) => namedOperations.rename(checklist.id, name)}
          onDelete={() => namedOperations.remove(checklist.id)}
        />
      ))}
      {!disabled && (
        <div className="border-t border-subtle px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => void namedOperations.create(t("issue_checklist.named.default_name"))}
            className="flex items-center gap-1.5 rounded-sm px-1 py-1 text-body-sm-regular text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
          >
            <ListPlus className="size-3.5" />
            {t("issue_checklist.named.new")}
          </button>
        </div>
      )}
    </div>
  );
});
