/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ArchiveRestoreIcon, FileOutput, LayoutTemplate, LockKeyhole, LockKeyholeOpen } from "lucide-react";
// constants
import { EPageAccess } from "@plane/constants";
// plane editor
import { LinkIcon, CopyIcon, LockIcon, NewTabIcon, ArchiveIcon, TrashIcon, GlobeIcon } from "@plane/propel/icons";
// plane ui
import type { TContextMenuItem } from "@plane/ui";
import { ContextMenu, CustomMenu } from "@plane/ui";
// components
import { cn } from "@plane/utils";
import { openSaveTemplateModal } from "@/components/entity-templates/save-modal-store";
import { DeletePageModal } from "@/components/pages/modals/delete-page-modal";
// hooks
import { usePageOperations } from "@/hooks/use-page-operations";
// plane web hooks
import type { EPageStoreType } from "@/hooks/store";
import { usePageFlag } from "@/hooks/use-page-flag";
// store types
import type { TPageInstance } from "@/store/pages/base-page";

export type TPageActions =
  | "full-screen"
  | "sticky-toolbar"
  | "copy-markdown"
  | "toggle-lock"
  | "toggle-access"
  | "open-in-new-tab"
  | "copy-link"
  | "make-a-copy"
  | "save-as-template"
  | "archive-restore"
  | "delete"
  | "version-history"
  | "export"
  | "move";

type Props = {
  extraOptions?: (TContextMenuItem & { key: TPageActions })[];
  optionsOrder: TPageActions[];
  page: TPageInstance;
  parentRef?: React.RefObject<HTMLElement | null>;
  storeType: EPageStoreType;
};

export const PageActions = observer(function PageActions(props: Props) {
  const { extraOptions, optionsOrder, page, parentRef, storeType } = props;
  // states
  const [deletePageModal, setDeletePageModal] = useState(false);
  const [_movePageModal, setMovePageModal] = useState(false);
  // params
  const { workspaceSlug } = useParams();
  // Pespo: useTranslation fica no topo; dentro do useMemo ele muda a ordem dos hooks quando o memo não recalcula.
  const { t } = useTranslation();
  // page flag
  const { isMovePageEnabled } = usePageFlag({
    workspaceSlug: workspaceSlug?.toString() ?? "",
  });
  // page operations
  const { pageOperations } = usePageOperations({
    page,
  });
  // derived values
  const {
    access,
    archived_at,
    is_locked,
    canCurrentUserArchivePage,
    canCurrentUserChangeAccess,
    canCurrentUserDeletePage,
    canCurrentUserDuplicatePage,
    canCurrentUserLockPage,
    canCurrentUserMovePage,
  } = page;
  // menu items
  const MENU_ITEMS = useMemo(
    function MENU_ITEMS() {
      const menuItems: (TContextMenuItem & { key: TPageActions })[] = [
        {
          key: "toggle-lock",
          action: () => {
            pageOperations.toggleLock();
          },
          title: is_locked ? t("ui.unlock") : t("ui.lock"),
          icon: is_locked ? LockKeyholeOpen : LockKeyhole,
          shouldRender: canCurrentUserLockPage,
        },
        {
          key: "toggle-access",
          action: () => {
            pageOperations.toggleAccess();
          },
          title: access === EPageAccess.PUBLIC ? t("ui.make_private") : t("ui.make_public"),
          icon: access === EPageAccess.PUBLIC ? LockIcon : GlobeIcon,
          shouldRender: canCurrentUserChangeAccess && !archived_at,
        },
        {
          key: "open-in-new-tab",
          action: pageOperations.openInNewTab,
          title: t("open_in_new_tab"),
          icon: NewTabIcon,
          shouldRender: true,
        },
        {
          key: "copy-link",
          action: pageOperations.copyLink,
          title: t("copy_link"),
          icon: LinkIcon,
          shouldRender: true,
        },
        {
          key: "make-a-copy",
          action: () => {
            pageOperations.duplicate();
          },
          title: t("make_a_copy"),
          icon: CopyIcon,
          shouldRender: canCurrentUserDuplicatePage,
        },
        // Pespo: a página vira modelo para criar outras.
        {
          key: "save-as-template",
          action: () => {
            if (page.id) openSaveTemplateModal({ kind: "page", sourceId: page.id, sourceName: page.name ?? "" });
          },
          title: t("entity_templates.save_as_template"),
          icon: LayoutTemplate,
          shouldRender: canCurrentUserDuplicatePage && !archived_at,
        },
        {
          key: "archive-restore",
          action: () => {
            pageOperations.toggleArchive();
          },
          title: archived_at ? t("restore") : t("archive"),
          icon: archived_at ? ArchiveRestoreIcon : ArchiveIcon,
          shouldRender: canCurrentUserArchivePage,
        },
        {
          key: "delete",
          action: () => {
            setDeletePageModal(true);
          },
          title: t("delete"),
          icon: TrashIcon,
          shouldRender: canCurrentUserDeletePage && !!archived_at,
        },
        {
          key: "move",
          action: () => setMovePageModal(true),
          title: t("ui.move"),
          icon: FileOutput,
          shouldRender: canCurrentUserMovePage && isMovePageEnabled,
        },
      ];
      if (extraOptions) {
        menuItems.push(...extraOptions);
      }
      return menuItems;
    },
    [
      extraOptions,
      is_locked,
      canCurrentUserLockPage,
      access,
      canCurrentUserChangeAccess,
      archived_at,
      canCurrentUserDuplicatePage,
      canCurrentUserArchivePage,
      canCurrentUserDeletePage,
      canCurrentUserMovePage,
      isMovePageEnabled,
      pageOperations,
      page.id,
      page.name,
      t,
    ]
  );
  // arrange options
  const arrangedOptions = useMemo<(TContextMenuItem & { key: TPageActions })[]>(
    () =>
      optionsOrder
        .map((key) => MENU_ITEMS.find((item) => item.key === key))
        .filter((item): item is TContextMenuItem & { key: TPageActions } => !!item),
    [optionsOrder, MENU_ITEMS]
  );

  return (
    <>
      <DeletePageModal
        isOpen={deletePageModal}
        onClose={() => setDeletePageModal(false)}
        page={page}
        storeType={storeType}
      />
      {parentRef && <ContextMenu parentRef={parentRef} items={arrangedOptions} />}
      <CustomMenu placement="bottom-end" optionsClassName="max-h-[90vh]" ellipsis closeOnSelect>
        {arrangedOptions.map((item) => {
          if (item.shouldRender === false) return null;
          return (
            <CustomMenu.MenuItem
              key={item.key}
              onClick={() => {
                item.action?.();
              }}
              className={cn("flex items-center gap-2", item.className)}
              disabled={item.disabled}
            >
              {item.customContent ?? (
                <>
                  {item.icon && <item.icon className="size-3" />}
                  {item.title}
                </>
              )}
            </CustomMenu.MenuItem>
          );
        })}
      </CustomMenu>
    </>
  );
});
