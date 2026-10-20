/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueServiceType } from "@plane/types";
import { Collapsible, CollapsibleButton } from "@plane/ui";
import { countCompletedChecklistItems } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { IssueChecklistCollapsibleContent } from "./content";
import { useIssueChecklistItems } from "./helper";
import { IssueChecklistActionButton } from "./quick-action-button";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

// Pespo: subtarefas leves do item de trabalho (checklist em árvore, com responsável e prazo por linha).
// Só aparece quando há pelo menos uma linha (o botão "Subtarefa" fica sempre na fileira de ações acima).
export const ChecklistCollapsible = observer(function ChecklistCollapsible(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, issueServiceType } = props;
  const { t } = useTranslation();
  const { openWidgets, toggleOpenWidget } = useIssueDetail(issueServiceType);
  const { data: items = [] } = useIssueChecklistItems(workspaceSlug, projectId, issueId);
  const isCollapsibleOpen = openWidgets.includes("checklist");
  const completed = countCompletedChecklistItems(items);

  const indicatorElement = useMemo(
    () => (
      <span className="flex items-center justify-center">
        <p className="text-14 !leading-3 text-tertiary">
          {completed}/{items.length}
        </p>
      </span>
    ),
    [completed, items.length]
  );

  if (items.length === 0) return null;

  return (
    <Collapsible
      isOpen={isCollapsibleOpen}
      onToggle={() => toggleOpenWidget("checklist")}
      title={
        <CollapsibleButton
          isOpen={isCollapsibleOpen}
          title={t("issue_checklist.title")}
          indicatorElement={indicatorElement}
          actionItemElement={
            !disabled && (
              <IssueChecklistActionButton
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                disabled={disabled}
                issueServiceType={issueServiceType}
              />
            )
          }
        />
      }
      buttonClassName="w-full"
    >
      <IssueChecklistCollapsibleContent
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        disabled={disabled}
      />
    </Collapsible>
  );
});
