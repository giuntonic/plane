/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { observer } from "mobx-react";

import { useTranslation } from "@plane/i18n";
import { LinkIcon, NewTabIcon, EditIcon, TrashIcon, StateGroupIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TStateGroups } from "@plane/types";
import type { TContextMenuItem } from "@plane/ui";
import { LinkItemBlock } from "@plane/ui";
// plane utils
import { copyTextToClipboard } from "@plane/utils";
// hooks
import { useHome } from "@/hooks/store/use-home";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
// types
import type { TLinkOperations } from "./use-links";

export type TProjectLinkDetail = {
  workspaceSlug: string;
  linkId: string;
  linkOperations: TLinkOperations;
};

export const ProjectLinkDetail = observer(function ProjectLinkDetail(props: TProjectLinkDetail) {
  // props
  const { workspaceSlug, linkId, linkOperations } = props;
  // hooks
  const {
    quickLinks: { getLinkById, toggleLinkModal, setLinkData },
  } = useHome();
  const { setPeekIssue } = useIssueDetail();
  const { getProjectById } = useProject();
  const { t } = useTranslation();
  // derived values
  const linkDetail = getLinkById(linkId);
  const linkUrl = linkDetail?.url;
  // Pespo: link pra item de trabalho — nome e estado sempre atuais; null = item sumiu ou sem acesso
  const isWorkItemLink = !!linkDetail?.issue;
  const workItem = linkDetail?.issue_detail ?? null;

  // handlers
  const handleEdit = useCallback(
    (modalToggle: boolean) => {
      toggleLinkModal(modalToggle);
      setLinkData(linkDetail);
    },
    [linkDetail, setLinkData, toggleLinkModal]
  );

  const handleCopyText = useCallback(() => {
    if (!linkUrl) return;
    void copyTextToClipboard(linkUrl).then(() =>
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("link_copied"),
        message: t("view_link_copied_to_clipboard"),
      })
    );
  }, [linkUrl, t]);

  const handleOpenInNewTab = useCallback(() => {
    window.open(linkUrl, "_blank", "noopener,noreferrer");
  }, [linkUrl]);

  const handleOpen = useCallback(() => {
    if (!isWorkItemLink) return handleOpenInNewTab();
    if (!workItem) return;
    setPeekIssue({ workspaceSlug, projectId: workItem.project_id, issueId: workItem.id });
  }, [isWorkItemLink, workItem, workspaceSlug, setPeekIssue, handleOpenInNewTab]);

  const handleDelete = useCallback(() => {
    linkOperations.remove(linkId);
  }, [linkId, linkOperations]);

  // derived values
  const menuItems = useMemo<TContextMenuItem[]>(
    () =>
      [
        {
          key: "edit",
          action: () => handleEdit(true),
          title: t("edit"),
          icon: EditIcon,
        },
        {
          key: "open-new-tab",
          action: handleOpenInNewTab,
          title: t("open_in_new_tab"),
          icon: NewTabIcon,
          shouldRender: !isWorkItemLink || !!workItem,
        },
        {
          key: "copy-link",
          action: handleCopyText,
          title: t("copy_link"),
          icon: LinkIcon,
          shouldRender: !isWorkItemLink || !!workItem,
        },
        {
          key: "delete",
          action: handleDelete,
          title: t("delete"),
          icon: TrashIcon,
        },
      ].filter((item) => item.shouldRender !== false),
    [handleEdit, handleOpenInNewTab, handleCopyText, handleDelete, isWorkItemLink, workItem, t]
  );

  if (!linkDetail) return null;

  if (isWorkItemLink) {
    return (
      <LinkItemBlock
        title={workItem ? linkDetail.title || workItem.name : t("home.quick_links.work_item_unavailable")}
        url={linkDetail.url}
        subtitle={workItem ? (getProjectById(workItem.project_id)?.name ?? workItem.project_identifier) : undefined}
        icon={
          <StateGroupIcon
            stateGroup={(workItem?.state_group as TStateGroups | null) ?? "backlog"}
            color={workItem?.state_color ?? undefined}
            className="size-4"
          />
        }
        muted={!workItem}
        menuItems={menuItems}
        onClick={handleOpen}
      />
    );
  }

  return (
    <LinkItemBlock
      title={linkDetail.title || linkDetail.url}
      url={linkDetail.url}
      createdAt={linkDetail.created_at}
      menuItems={menuItems}
      onClick={handleOpen}
    />
  );
});
