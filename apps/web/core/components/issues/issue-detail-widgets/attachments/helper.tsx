/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { useMemo } from "react";
import { useSWRConfig } from "swr";
import { setPromiseToast, TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// components
import { getCardExtrasKey } from "@/components/issues/card-extras";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// types
import type { TAttachmentUploadStatus } from "@/store/issue/issue-details/attachment.store";

export type TAttachmentOperations = {
  create: (file: File) => Promise<void>;
  remove: (attachmentId: string) => Promise<void>;
};

export type TAttachmentSnapshot = {
  uploadStatus: TAttachmentUploadStatus[] | undefined;
};

export type TAttachmentHelpers = {
  operations: TAttachmentOperations;
  snapshot: TAttachmentSnapshot;
};

export const useAttachmentOperations = (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  issueServiceType: TIssueServiceType = EIssueServiceType.ISSUES
): TAttachmentHelpers => {
  const { t } = useTranslation();
  const {
    attachment: { createAttachment, removeAttachment, fetchAttachments, getAttachmentsUploadStatusByIssueId },
  } = useIssueDetail(issueServiceType);
  const { mutate } = useSWRConfig();

  const attachmentOperations: TAttachmentOperations = useMemo(
    () => ({
      create: async (file) => {
        if (!workspaceSlug || !projectId || !issueId) throw new Error("Missing required fields");
        const attachmentUploadPromise = createAttachment(workspaceSlug, projectId, issueId, file);
        setPromiseToast(attachmentUploadPromise, {
          loading: t("ui.uploading_attachment"),
          success: {
            title: t("ui.attachment_uploaded"),
            message: () => "The attachment has been successfully uploaded",
          },
          error: {
            title: t("ui.attachment_not_uploaded"),
            message: () => "The attachment could not be uploaded",
          },
        });

        await attachmentUploadPromise;
        // Pespo: a primeira imagem vira a capa do card no servidor; traz a marca e atualiza o quadro.
        void fetchAttachments(workspaceSlug, projectId, issueId);
        void mutate(getCardExtrasKey(projectId));
      },
      remove: async (attachmentId) => {
        try {
          if (!workspaceSlug || !projectId || !issueId) throw new Error("Missing required fields");
          await removeAttachment(workspaceSlug, projectId, issueId, attachmentId);
          void mutate(getCardExtrasKey(projectId)); // Pespo: a capa pode ter saído junto
          setToast({
            message: t("ui.the_attachment_has_been_successfully_removed"),
            type: TOAST_TYPE.SUCCESS,
            title: t("ui.attachment_removed"),
          });
        } catch (_error) {
          setToast({
            message: t("ui.the_attachment_could_not_be_removed"),
            type: TOAST_TYPE.ERROR,
            title: t("ui.attachment_not_removed"),
          });
        }
      },
    }),
    [workspaceSlug, projectId, issueId, createAttachment, removeAttachment, fetchAttachments, mutate, t]
  );
  const attachmentsUploadStatus = getAttachmentsUploadStatusByIssueId(issueId);

  return {
    operations: attachmentOperations,
    snapshot: { uploadStatus: attachmentsUploadStatus },
  };
};
