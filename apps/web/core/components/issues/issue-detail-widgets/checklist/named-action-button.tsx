/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueServiceType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { useIssueNamedChecklistOperations } from "./helper";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  customButton: React.ReactNode;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

// Pespo: "Checklist" nos botões do item de trabalho — cria uma checklist com nome (estilo Trello), abre a
// seção e deixa o nome pronto para editar.
export const IssueNamedChecklistActionButton = observer(function IssueNamedChecklistActionButton(props: Props) {
  const { workspaceSlug, projectId, issueId, customButton, disabled = false, issueServiceType } = props;
  const { t } = useTranslation();
  const { openWidgets, toggleOpenWidget } = useIssueDetail(issueServiceType);
  const { create } = useIssueNamedChecklistOperations(workspaceSlug, projectId, issueId);

  const handleClick = async () => {
    if (disabled) return;
    if (!openWidgets.includes("checklist")) toggleOpenWidget("checklist");
    await create(t("issue_checklist.named.default_name"));
  };

  return (
    <button type="button" onClick={() => void handleClick()} disabled={disabled} className="inline-flex">
      {customButton}
    </button>
  );
});
