/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { PlusIcon } from "@plane/propel/icons";
import type { TIssueServiceType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { useIssueChecklistOperations } from "./helper";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  customButton?: React.ReactNode;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

// Pespo: "Subtarefa" nos botões do item de trabalho — cria uma linha no fim da lista, abre a seção e põe o
// cursor nela.
export const IssueChecklistActionButton = observer(function IssueChecklistActionButton(props: Props) {
  const { workspaceSlug, projectId, issueId, customButton, disabled = false, issueServiceType } = props;
  const { openWidgets, toggleOpenWidget } = useIssueDetail(issueServiceType);
  const operations = useIssueChecklistOperations(workspaceSlug, projectId, issueId);

  const handleClick = async (event: React.SyntheticEvent) => {
    // inside the collapsible header the click would also toggle the section
    event.stopPropagation();
    event.preventDefault();
    if (disabled) return;
    if (!openWidgets.includes("checklist")) toggleOpenWidget("checklist");
    await operations.createAtEnd(null);
  };

  // a <span role="button">, not a <button>: in the collapsible header this sits inside the header's own
  // <button>, and a nested <button> is invalid HTML (breaks SSR hydration)
  return (
    <span
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={(event) => void handleClick(event)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") void handleClick(event);
      }}
      className="inline-flex"
    >
      {customButton ?? <PlusIcon className="h-4 w-4" />}
    </span>
  );
});
