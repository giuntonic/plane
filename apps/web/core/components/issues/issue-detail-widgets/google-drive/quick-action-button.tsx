/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Copy, Link2 } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { PlusIcon } from "@plane/propel/icons";
import type { TGoogleDriveFile, TIssueServiceType } from "@plane/types";
import { CustomMenu } from "@plane/ui";
// components
import { GoogleDrivePickerModal } from "@/components/integration/google-drive/picker-modal";
// local imports
import { useIssueGoogleDriveOperations } from "./helper";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  customButton?: React.ReactNode;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

type TPickMode = "link" | "copy";

// Pespo: "Google Drive" nos botões do item de trabalho — vincular um arquivo
// (fica no Drive, sempre atualizado) ou copiar pra os anexos do Plane.
export const IssueGoogleDriveActionButton = observer(function IssueGoogleDriveActionButton(props: Props) {
  const { workspaceSlug, projectId, issueId, customButton, disabled = false, issueServiceType } = props;
  const { t } = useTranslation();
  const [pickMode, setPickMode] = useState<TPickMode | null>(null);
  const operations = useIssueGoogleDriveOperations(workspaceSlug, projectId, issueId, issueServiceType);

  const handleSelect = async (file: TGoogleDriveFile) => {
    try {
      await (pickMode === "copy" ? operations.copyToAttachments(file) : operations.link(file));
      setPickMode(null);
    } catch {
      // toast already shown — keep the picker open so another file can be chosen
    }
  };

  return (
    <>
      <CustomMenu
        customButton={customButton ?? <PlusIcon className="h-4 w-4" />}
        placement="bottom-start"
        disabled={disabled}
        closeOnSelect
      >
        <CustomMenu.MenuItem onClick={() => setPickMode("link")}>
          <div className="flex items-center gap-2">
            <Link2 className="size-3" />
            <span>{t("google_drive_integration.widget.attach_link")}</span>
          </div>
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem onClick={() => setPickMode("copy")}>
          <div className="flex items-center gap-2">
            <Copy className="size-3" />
            <span>{t("google_drive_integration.widget.attach_copy")}</span>
          </div>
        </CustomMenu.MenuItem>
      </CustomMenu>
      <GoogleDrivePickerModal
        isOpen={!!pickMode}
        onClose={() => setPickMode(null)}
        onSelect={handleSelect}
        allowCreate={pickMode === "link"}
        title={
          pickMode === "copy"
            ? t("google_drive_integration.widget.attach_copy")
            : t("google_drive_integration.widget.attach_link")
        }
      />
    </>
  );
});
