/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TGoogleDriveFile, TIssueServiceType } from "@plane/types";
// components
import { getGoogleDriveErrorKey } from "@/components/integration/google-drive/helpers";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { StoreContext } from "@/lib/store-context";
// services
import { googleDriveService } from "@/services/google-drive.service";

export const getIssueGoogleDriveFilesKey = (issueId: string) => `ISSUE_GOOGLE_DRIVE_FILES_${issueId}`;

/** Drive files linked to a work item. Shared SWR key, so the action button and the list stay in sync. */
export const useIssueGoogleDriveFiles = (workspaceSlug: string, projectId: string, issueId: string) =>
  useSWR(workspaceSlug && projectId && issueId ? getIssueGoogleDriveFilesKey(issueId) : null, () =>
    googleDriveService.listIssueFiles(workspaceSlug, projectId, issueId)
  );

export const useIssueGoogleDriveOperations = (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  issueServiceType: TIssueServiceType
) => {
  const { t } = useTranslation();
  const store = useContext(StoreContext);
  const { mutate } = useIssueGoogleDriveFiles(workspaceSlug, projectId, issueId);
  const {
    fetchActivities,
    setLastWidgetAction,
    attachment: { fetchAttachments, getAttachmentsCountByIssueId },
  } = useIssueDetail(issueServiceType);

  const showError = (error: unknown) =>
    setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t(getGoogleDriveErrorKey(error)) });

  const link = async (file: TGoogleDriveFile) => {
    try {
      await googleDriveService.linkIssueFile(workspaceSlug, projectId, issueId, file.id);
      await mutate();
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("google_drive_integration.widget.linked") });
      void fetchActivities(workspaceSlug, projectId, issueId);
    } catch (error) {
      showError(error);
      throw error;
    }
  };

  /** Copies the file into Plane as a regular attachment. */
  const copyToAttachments = async (file: TGoogleDriveFile) => {
    try {
      await googleDriveService.importIssueFile(workspaceSlug, projectId, issueId, file.id);
      await fetchAttachments(workspaceSlug, projectId, issueId);
      // Same local update the regular upload flow does, so the "Attachments"
      // header count doesn't lag behind.
      store.issue.issues.updateIssue(issueId, { attachment_count: getAttachmentsCountByIssueId(issueId) });
      setLastWidgetAction("attachments");
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("google_drive_integration.widget.copied") });
      void fetchActivities(workspaceSlug, projectId, issueId);
    } catch (error) {
      showError(error);
      throw error;
    }
  };

  const unlink = async (id: string) => {
    try {
      await googleDriveService.unlinkIssueFile(workspaceSlug, projectId, issueId, id);
      await mutate();
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("google_drive_integration.widget.removed") });
      void fetchActivities(workspaceSlug, projectId, issueId);
    } catch (error) {
      showError(error);
    }
  };

  return { link, copyToAttachments, unlink };
};
