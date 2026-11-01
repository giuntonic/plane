/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { Copy, FileSpreadsheet, FileText, Presentation, Upload } from "lucide-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TGoogleDriveCreatableKind, TGoogleDriveFile, TIssueServiceType } from "@plane/types";
import { CustomMenu } from "@plane/ui";
// components
import { GoogleMark, useGoogleConnect } from "@/components/integration/google";
import {
  GOOGLE_DRIVE_STATUS_SWR_KEY,
  GoogleDrivePickerModal,
} from "@/components/integration/google-drive/picker-modal";
import { getGoogleDriveErrorKey } from "@/components/integration/google-drive/helpers";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useFileSize } from "@/hooks/use-file-size";
// services
import { googleDriveService } from "@/services/google-drive.service";
// local imports
import { useIssueGoogleDriveOperations } from "../google-drive/helper";
import { useAttachmentOperations } from "./helper";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  customButton: React.ReactNode;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

type TPickMode = "link" | "copy";

const NEW_FILE_OPTIONS: { kind: TGoogleDriveCreatableKind; icon: typeof FileText; i18n: string }[] = [
  { kind: "document", icon: FileText, i18n: "google_drive_integration.attach.new_document" },
  { kind: "spreadsheet", icon: FileSpreadsheet, i18n: "google_drive_integration.attach.new_spreadsheet" },
  { kind: "presentation", icon: Presentation, i18n: "google_drive_integration.attach.new_presentation" },
];

const item = (icon: React.ReactNode, label: string) => (
  <div className="flex items-center gap-2">
    {icon}
    <span>{label}</span>
  </div>
);

/**
 * Pespo: "Anexar" num lugar só — arquivo do computador, arquivo do Google Drive (vinculado ou como cópia) e
 * documento novo do Google, criado na pasta do projeto no Drive com o nome do item e já vinculado.
 */
export const IssueAttachMenu = observer(function IssueAttachMenu(props: Props) {
  const { workspaceSlug, projectId, issueId, customButton, disabled = false, issueServiceType } = props;
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickMode, setPickMode] = useState<TPickMode | null>(null);
  const { operations: attachments } = useAttachmentOperations(workspaceSlug, projectId, issueId, issueServiceType);
  const drive = useIssueGoogleDriveOperations(workspaceSlug, projectId, issueId, issueServiceType);
  const { limitFor } = useFileSize();
  const { getProjectById } = useProject();
  const {
    issue: { getIssueById },
    fetchActivities,
    setLastWidgetAction,
  } = useIssueDetail(issueServiceType);
  const { data: driveStatus } = useSWR(GOOGLE_DRIVE_STATUS_SWR_KEY, () => googleDriveService.status(), {
    revalidateOnFocus: false,
  });
  const { connect } = useGoogleConnect();

  const upload = async (file: File) => {
    if (file.size > limitFor(file)) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("ui.file_size_limit", { size: Math.round(limitFor(file) / 1024 / 1024) }),
      });
      return;
    }
    try {
      await attachments.create(file);
    } catch {
      // o toast do envio já avisou
    } finally {
      void fetchActivities(workspaceSlug, projectId, issueId);
      setLastWidgetAction("attachments");
    }
  };

  const handlePicked = async (file: TGoogleDriveFile) => {
    try {
      await (pickMode === "copy" ? drive.copyToAttachments(file) : drive.link(file));
      setPickMode(null);
      setLastWidgetAction("attachments");
    } catch {
      // toast already shown — keep the picker open so another file can be chosen
    }
  };

  const createDocument = async (kind: TGoogleDriveCreatableKind) => {
    if (!driveStatus?.connected) {
      connect();
      return;
    }
    // a aba abre no clique (senão o navegador bloqueia) e recebe o documento quando ele existir
    const tab = window.open("about:blank", "_blank");
    try {
      const project = getProjectById(projectId);
      const file = await googleDriveService.createFile({
        kind,
        name: getIssueById(issueId)?.name || t("google_drive_integration.attach.untitled"),
        parent_id: project?.google_drive_folder_id || undefined,
      });
      await drive.link(file);
      setLastWidgetAction("attachments");
      if (tab && file.web_view_link) tab.location.href = file.web_view_link;
      else tab?.close();
    } catch (error) {
      tab?.close();
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t(getGoogleDriveErrorKey(error)) });
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      <CustomMenu customButton={customButton} placement="bottom-start" disabled={disabled} closeOnSelect>
        <CustomMenu.MenuItem onClick={() => fileInputRef.current?.click()}>
          {item(<Upload className="size-3.5" />, t("google_drive_integration.attach.from_computer"))}
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem onClick={() => setPickMode("link")}>
          {item(<GoogleMark className="size-3.5" />, t("google_drive_integration.attach.from_drive"))}
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem onClick={() => setPickMode("copy")}>
          {item(<Copy className="size-3.5" />, t("google_drive_integration.attach.copy_from_drive"))}
        </CustomMenu.MenuItem>
        <div className="my-1 border-t border-subtle" />
        {NEW_FILE_OPTIONS.map((option) => (
          <CustomMenu.MenuItem key={option.kind} onClick={() => void createDocument(option.kind)}>
            {item(<option.icon className="size-3.5" />, t(option.i18n))}
          </CustomMenu.MenuItem>
        ))}
      </CustomMenu>
      <GoogleDrivePickerModal
        isOpen={!!pickMode}
        onClose={() => setPickMode(null)}
        onSelect={handlePicked}
        allowCreate={pickMode === "link"}
        title={
          pickMode === "copy"
            ? t("google_drive_integration.attach.copy_from_drive")
            : t("google_drive_integration.attach.from_drive")
        }
      />
    </>
  );
});
