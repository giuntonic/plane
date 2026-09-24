/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Eye, ExternalLink, HardDrive, Pencil, Trash2 } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueGoogleDriveFile, TIssueServiceType } from "@plane/types";
import { Tooltip } from "@plane/propel/tooltip";
import type { TGoogleDriveEmbedMode } from "@plane/utils";
import { getGoogleDriveKindFromMimeType, isGoogleDriveKindEditable, renderFormattedDate } from "@plane/utils";
// components
import { GoogleDriveFileViewerModal } from "@/components/integration/google-drive/file-viewer-modal";
// local imports
import { useIssueGoogleDriveFiles, useIssueGoogleDriveOperations } from "./helper";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueServiceType: TIssueServiceType;
};

type TViewerState = { file: TIssueGoogleDriveFile; mode: TGoogleDriveEmbedMode } | null;

export const IssueGoogleDriveCollapsibleContent = observer(function IssueGoogleDriveCollapsibleContent(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled, issueServiceType } = props;
  const { t } = useTranslation();
  const [viewer, setViewer] = useState<TViewerState>(null);
  const { data: files = [] } = useIssueGoogleDriveFiles(workspaceSlug, projectId, issueId);
  const { unlink } = useIssueGoogleDriveOperations(workspaceSlug, projectId, issueId, issueServiceType);

  const actionClassName =
    "grid size-6 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-primary";

  return (
    <>
      <ul className="flex flex-col gap-1 px-1.5 pb-2">
        {files.map((file) => {
          const kind = getGoogleDriveKindFromMimeType(file.mime_type);
          const editable = isGoogleDriveKindEditable(kind);
          return (
            <li
              key={file.id}
              className="group flex items-center gap-3 rounded-md border border-subtle px-3 py-2 hover:bg-layer-transparent-hover"
            >
              {file.icon_link ? (
                <img src={file.icon_link} alt="" className="size-4 flex-shrink-0" />
              ) : (
                <HardDrive className="size-4 flex-shrink-0 text-tertiary" />
              )}
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setViewer({ file, mode: "preview" })}
              >
                <span className="block truncate text-body-sm-medium text-primary">{file.name}</span>
                <span className="block truncate text-caption-sm-regular text-tertiary">
                  {file.created_by_detail?.display_name
                    ? `${t("google_drive_integration.widget.added_by", { name: file.created_by_detail.display_name })} · `
                    : ""}
                  {renderFormattedDate(file.created_at)}
                </span>
              </button>
              <div className="flex flex-shrink-0 items-center gap-0.5">
                <Tooltip tooltipContent={t("google_drive_integration.widget.preview")}>
                  <button
                    type="button"
                    className={actionClassName}
                    onClick={() => setViewer({ file, mode: "preview" })}
                  >
                    <Eye className="size-3.5" />
                  </button>
                </Tooltip>
                {editable && (
                  <Tooltip tooltipContent={t("google_drive_integration.widget.edit")}>
                    <button type="button" className={actionClassName} onClick={() => setViewer({ file, mode: "edit" })}>
                      <Pencil className="size-3.5" />
                    </button>
                  </Tooltip>
                )}
                <Tooltip tooltipContent={t("google_drive_integration.widget.open")}>
                  <a href={file.web_view_link} target="_blank" rel="noopener noreferrer" className={actionClassName}>
                    <ExternalLink className="size-3.5" />
                  </a>
                </Tooltip>
                {!disabled && (
                  <Tooltip tooltipContent={t("google_drive_integration.widget.remove")}>
                    <button
                      type="button"
                      className={`${actionClassName} hover:text-danger-primary`}
                      onClick={() => void unlink(file.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </Tooltip>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <GoogleDriveFileViewerModal
        file={
          viewer
            ? {
                fileId: viewer.file.drive_file_id,
                kind: getGoogleDriveKindFromMimeType(viewer.file.mime_type),
                name: viewer.file.name,
                iconLink: viewer.file.icon_link,
              }
            : null
        }
        initialMode={viewer?.mode}
        onClose={() => setViewer(null)}
      />
    </>
  );
});
