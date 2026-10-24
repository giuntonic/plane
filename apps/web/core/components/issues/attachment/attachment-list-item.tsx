/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Image, ImageOff } from "lucide-react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useSWRConfig } from "swr";

import { useTranslation } from "@plane/i18n";
import { TrashIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueCardExtras, TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// ui
import { CustomMenu } from "@plane/ui";
import { convertBytesToSize, getFileExtension, getFileName, getFileURL, renderFormattedDate } from "@plane/utils";
// components
//
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { getFileIcon } from "@/components/icons";
import { getCardExtrasKey, patchCover } from "@/components/issues/card-extras";
// helpers
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { usePlatformOS } from "@/hooks/use-platform-os";
// services
import { issueCardService } from "@/services/issue-card.service";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif"]);

type TIssueAttachmentsListItem = {
  attachmentId: string;
  /** Pespo: item e projeto do anexo, para a capa (o anexo embutido no item não traz esses campos). */
  issueId?: string;
  projectId?: string;
  disabled?: boolean;
  issueServiceType?: TIssueServiceType;
};

export const IssueAttachmentsListItem = observer(function IssueAttachmentsListItem(props: TIssueAttachmentsListItem) {
  const { t } = useTranslation();
  // props
  const {
    attachmentId,
    issueId,
    projectId: projectIdProp,
    disabled,
    issueServiceType = EIssueServiceType.ISSUES,
  } = props;
  // store hooks
  const { getUserDetails } = useMember();
  const {
    attachment: { getAttachmentById, fetchAttachments },
    issue: { getIssueById },
    toggleDeleteAttachmentModal,
  } = useIssueDetail(issueServiceType);
  const { workspaceSlug } = useParams();
  const { mutate } = useSWRConfig();
  const [isSavingCover, setIsSavingCover] = useState(false);
  // derived values
  const attachment = attachmentId ? getAttachmentById(attachmentId) : undefined;
  const fileName = getFileName(attachment?.attributes.name ?? "");
  const fileExtension = getFileExtension(attachment?.attributes.name ?? "");
  const fileIcon = getFileIcon(fileExtension, 18);
  const fileURL = getFileURL(attachment?.asset_url ?? "");
  // Pespo: capa do card (só imagens de itens de trabalho)
  const attachmentIssueId = issueId ?? attachment?.issue ?? attachment?.issue_id;
  const projectId =
    projectIdProp ??
    attachment?.project ??
    (attachmentIssueId ? getIssueById(attachmentIssueId)?.project_id : undefined);
  const isImage =
    (attachment?.attributes.type ?? "").startsWith("image/") || IMAGE_EXTENSIONS.has(fileExtension.toLowerCase());
  const isCover = !!attachment?.attributes.pespo_cover;
  const canSetCover =
    issueServiceType === EIssueServiceType.ISSUES && isImage && !!projectId && !!attachmentIssueId && !!workspaceSlug;

  const handleCover = async () => {
    if (!attachment || !projectId || !attachmentIssueId || !workspaceSlug || isSavingCover) return;
    setIsSavingCover(true);
    try {
      const { cover } = await issueCardService.setCover(
        workspaceSlug.toString(),
        projectId,
        attachmentIssueId,
        isCover ? null : attachment.id
      );
      await mutate(
        getCardExtrasKey(projectId),
        (current?: TIssueCardExtras) => patchCover(current, attachmentIssueId, cover),
        { revalidate: false }
      );
      await fetchAttachments(workspaceSlug.toString(), projectId, attachmentIssueId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("issue_cover.set_done") });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("issue_cover.error") });
    } finally {
      setIsSavingCover(false);
    }
  };
  // hooks
  const { isMobile } = usePlatformOS();

  if (!attachment) return <></>;

  return (
    <>
      {/* Not a <button>: it contains other interactive controls (the ellipsis menu, tooltips), and nesting those inside a real button is invalid HTML. */}
      <div
        // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          window.open(fileURL, "_blank");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            window.open(fileURL, "_blank");
          }
        }}
      >
        <div className="group flex h-11 items-center justify-between gap-3 pr-2 pl-9 hover:bg-surface-2">
          <div className="flex items-center gap-3 truncate text-13">
            <div className="flex items-center gap-3">{fileIcon}</div>
            <Tooltip tooltipContent={`${fileName}.${fileExtension}`} isMobile={isMobile}>
              <p className="truncate font-medium text-secondary">{`${fileName}.${fileExtension}`}</p>
            </Tooltip>
            <span className="flex size-1.5 rounded-full bg-layer-1" />
            <span className="flex-shrink-0 text-placeholder">{convertBytesToSize(attachment.attributes.size)}</span>
            {isCover && (
              <span className="flex flex-shrink-0 items-center gap-1 rounded-sm bg-accent-subtle px-1.5 py-0.5 text-caption-sm-medium text-accent-primary">
                <Image className="size-3" />
                {t("issue_cover.badge")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {attachment?.created_by && (
              <>
                <Tooltip
                  isMobile={isMobile}
                  tooltipContent={`${
                    getUserDetails(attachment?.created_by)?.display_name ?? ""
                  } uploaded on ${renderFormattedDate(attachment.updated_at)}`}
                >
                  <div className="flex items-center justify-center">
                    <ButtonAvatars showTooltip userIds={attachment?.created_by} />
                  </div>
                </Tooltip>
              </>
            )}

            <CustomMenu ellipsis closeOnSelect placement="bottom-end" disabled={disabled}>
              {canSetCover && (
                <CustomMenu.MenuItem onClick={() => void handleCover()}>
                  <div className="flex items-center gap-2">
                    {isCover ? <ImageOff className="h-3.5 w-3.5" /> : <Image className="h-3.5 w-3.5" />}
                    <span>{isCover ? t("issue_cover.remove") : t("issue_cover.set")}</span>
                  </div>
                </CustomMenu.MenuItem>
              )}
              <CustomMenu.MenuItem
                onClick={() => {
                  toggleDeleteAttachmentModal(attachmentId);
                }}
              >
                <div className="flex items-center gap-2">
                  <TrashIcon className="h-3.5 w-3.5" strokeWidth={2} />
                  <span>{t("common.actions.delete")}</span>
                </div>
              </CustomMenu.MenuItem>
            </CustomMenu>
          </div>
        </div>
      </div>
    </>
  );
});
