/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { i18nInstance } from "@plane/i18n";
import { useMemo } from "react";
// plane imports
import { IS_FAVORITE_MENU_OPEN } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EPageAccess } from "@plane/types";
import { copyUrlToClipboard } from "@plane/utils";
// hooks
import { useCollaborativePageActions } from "@/hooks/use-collaborative-page-actions";
// store types
import type { TPageInstance } from "@/store/pages/base-page";
// local storage
import useLocalStorage from "./use-local-storage";

export type TPageOperations = {
  toggleLock: () => void;
  toggleAccess: () => void;
  toggleFavorite: () => void;
  openInNewTab: () => void;
  copyLink: () => void;
  duplicate: () => void;
  toggleArchive: () => void;
};

type Props = {
  page: TPageInstance;
};

export const usePageOperations = (
  props: Props
): {
  pageOperations: TPageOperations;
} => {
  const { page } = props;
  // derived values
  const {
    access,
    addToFavorites,
    archived_at,
    duplicate,
    is_favorite,
    is_locked,
    getRedirectionLink,
    removePageFromFavorites,
  } = page;
  // collaborative actions
  const { executeCollaborativeAction } = useCollaborativePageActions(props);
  // local storage
  const { setValue: toggleFavoriteMenu, storedValue: isFavoriteMenuOpen } = useLocalStorage<boolean>(
    IS_FAVORITE_MENU_OPEN,
    false
  );
  // page operations
  const pageOperations: TPageOperations = useMemo(() => {
    const pageLink = getRedirectionLink();

    return {
      copyLink: async () => {
        await copyUrlToClipboard(pageLink);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: i18nInstance.t("ui.link_copied"),
          message: i18nInstance.t("ui.page_link_copied_to_clipboard"),
        });
      },
      duplicate: async () => {
        try {
          await duplicate();
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: i18nInstance.t("toast.success"),
            message: i18nInstance.t("ui.page_duplicated_successfully"),
          });
        } catch (_error) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: i18nInstance.t("toast.error"),
            message: i18nInstance.t("ui.page_could_not_be_duplicated_please_try"),
          });
        }
      },
      move: async () => {},
      openInNewTab: () => window.open(pageLink, "_blank"),
      toggleAccess: async () => {
        const changedPageType = access === EPageAccess.PUBLIC ? "private" : "public";
        try {
          if (access === EPageAccess.PUBLIC)
            await executeCollaborativeAction({ type: "sendMessageToServer", message: "make-private" });
          else await executeCollaborativeAction({ type: "sendMessageToServer", message: "make-public" });
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: i18nInstance.t("toast.success"),
            message: `The page has been marked ${changedPageType} and moved to the ${changedPageType} section.`,
          });
        } catch (_error) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: i18nInstance.t("toast.error"),
            message: `The page couldn't be marked ${changedPageType}. Please try again.`,
          });
        }
      },
      toggleArchive: async () => {
        if (archived_at) {
          try {
            await executeCollaborativeAction({ type: "sendMessageToServer", message: "unarchive" });
            setToast({
              type: TOAST_TYPE.SUCCESS,
              title: i18nInstance.t("toast.success"),
              message: i18nInstance.t("ui.page_restored_successfully"),
            });
          } catch (_error) {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: i18nInstance.t("toast.error"),
              message: i18nInstance.t("ui.page_could_not_be_restored_please_try"),
            });
          }
        } else {
          try {
            await executeCollaborativeAction({ type: "sendMessageToServer", message: "archive" });
            setToast({
              type: TOAST_TYPE.SUCCESS,
              title: i18nInstance.t("toast.success"),
              message: i18nInstance.t("ui.page_archived_successfully"),
            });
          } catch (_error) {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: i18nInstance.t("toast.error"),
              message: i18nInstance.t("ui.page_could_not_be_archived_please_try"),
            });
          }
        }
      },
      toggleFavorite: async () => {
        if (is_favorite) {
          try {
            await removePageFromFavorites();
            setToast({
              type: TOAST_TYPE.SUCCESS,
              title: i18nInstance.t("toast.success"),
              message: i18nInstance.t("ui.page_removed_from_favorites"),
            });
          } catch (_error) {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: i18nInstance.t("toast.error"),
              message: i18nInstance.t("ui.page_could_not_be_removed_from_favorites"),
            });
          }
        } else {
          try {
            await addToFavorites();
            if (!isFavoriteMenuOpen) toggleFavoriteMenu(true);
            setToast({
              type: TOAST_TYPE.SUCCESS,
              title: i18nInstance.t("toast.success"),
              message: i18nInstance.t("ui.page_added_to_favorites"),
            });
          } catch (_error) {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: i18nInstance.t("toast.error"),
              message: i18nInstance.t("ui.page_could_not_be_added_to_favorites"),
            });
          }
        }
      },
      toggleLock: async () => {
        if (is_locked) {
          try {
            await executeCollaborativeAction({ type: "sendMessageToServer", message: "unlock" });
            setToast({
              type: TOAST_TYPE.SUCCESS,
              title: i18nInstance.t("toast.success"),
              message: i18nInstance.t("ui.page_unlocked_successfully"),
            });
          } catch (_error) {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: i18nInstance.t("toast.error"),
              message: i18nInstance.t("ui.page_could_not_be_unlocked_please_try"),
            });
          }
        } else {
          try {
            await executeCollaborativeAction({ type: "sendMessageToServer", message: "lock" });
            setToast({
              type: TOAST_TYPE.SUCCESS,
              title: i18nInstance.t("toast.success"),
              message: i18nInstance.t("ui.page_locked_successfully"),
            });
          } catch (_error) {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: i18nInstance.t("toast.error"),
              message: i18nInstance.t("ui.page_could_not_be_locked_please_try"),
            });
          }
        }
      },
    };
  }, [
    access,
    addToFavorites,
    archived_at,
    duplicate,
    executeCollaborativeAction,
    getRedirectionLink,
    is_favorite,
    is_locked,
    isFavoriteMenuOpen,
    removePageFromFavorites,
    toggleFavoriteMenu,
  ]);
  return {
    pageOperations,
  };
};
