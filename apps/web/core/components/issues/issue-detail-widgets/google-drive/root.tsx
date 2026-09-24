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
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { IssueGoogleDriveCollapsibleContent } from "./content";
import { useIssueGoogleDriveFiles } from "./helper";
import { IssueGoogleDriveActionButton } from "./quick-action-button";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

// Pespo: arquivos do Google Drive vinculados ao item de trabalho. Só aparece
// quando há pelo menos um arquivo (o botão "Google Drive" fica sempre visível
// na fileira de ações acima).
export const GoogleDriveCollapsible = observer(function GoogleDriveCollapsible(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, issueServiceType } = props;
  const { t } = useTranslation();
  const { openWidgets, toggleOpenWidget } = useIssueDetail(issueServiceType);
  const { data: files } = useIssueGoogleDriveFiles(workspaceSlug, projectId, issueId);
  const count = files?.length ?? 0;
  const isCollapsibleOpen = openWidgets.includes("google-drive");

  const indicatorElement = useMemo(
    () => (
      <span className="flex items-center justify-center">
        <p className="text-14 !leading-3 text-tertiary">{count}</p>
      </span>
    ),
    [count]
  );

  if (count === 0) return null;

  return (
    <Collapsible
      isOpen={isCollapsibleOpen}
      onToggle={() => toggleOpenWidget("google-drive")}
      title={
        <CollapsibleButton
          isOpen={isCollapsibleOpen}
          title={t("google_drive_integration.widget.title")}
          indicatorElement={indicatorElement}
          actionItemElement={
            !disabled && (
              <IssueGoogleDriveActionButton
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
      <IssueGoogleDriveCollapsibleContent
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        disabled={disabled}
        issueServiceType={issueServiceType}
      />
    </Collapsible>
  );
});
