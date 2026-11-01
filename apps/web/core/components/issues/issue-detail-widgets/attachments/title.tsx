/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useMemo } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
import { CollapsibleButton } from "@plane/ui";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { PlusIcon } from "@plane/propel/icons";
// local imports
import { useIssueGoogleDriveFiles } from "../google-drive/helper";
import { IssueAttachMenu } from "./attach-menu";

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueServiceType?: TIssueServiceType;
};

export const IssueAttachmentsCollapsibleTitle = observer(function IssueAttachmentsCollapsibleTitle(props: Props) {
  const { isOpen, workspaceSlug, projectId, issueId, disabled, issueServiceType = EIssueServiceType.ISSUES } = props;
  const { t } = useTranslation();
  // store hooks
  const {
    issue: { getIssueById },
  } = useIssueDetail(issueServiceType);

  // derived values
  const issue = getIssueById(issueId);
  // Pespo: os arquivos do Google Drive vinculados ao item ficam na mesma lista dos anexos
  const { data: driveFiles } = useIssueGoogleDriveFiles(workspaceSlug, projectId, issueId);
  const attachmentCount = (issue?.attachment_count ?? 0) + (driveFiles?.length ?? 0);

  // indicator element
  const indicatorElement = useMemo(
    () => (
      <span className="flex items-center justify-center">
        <p className="text-14 !leading-3 text-tertiary">{attachmentCount}</p>
      </span>
    ),
    [attachmentCount]
  );

  return (
    <CollapsibleButton
      isOpen={isOpen}
      title={t("common.attachments")}
      indicatorElement={indicatorElement}
      actionItemElement={
        !disabled && (
          <IssueAttachMenu
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueId={issueId}
            customButton={<PlusIcon className="h-4 w-4" />}
            disabled={disabled}
            issueServiceType={issueServiceType}
          />
        )
      }
    />
  );
});
