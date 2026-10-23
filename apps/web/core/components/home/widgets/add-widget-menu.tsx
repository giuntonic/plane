/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Plus } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { THomeWidgetKeys } from "@plane/types";
import { CustomMenu } from "@plane/ui";
// hooks
import { useHome } from "@/hooks/store/use-home";
// local imports
import { HOME_WIDGETS_LIST } from "../home-dashboard-widgets";

type Props = {
  workspaceSlug: string;
  availableWidgets: THomeWidgetKeys[];
};

// Pespo: último bloco da grade — devolve à home um widget que foi tirado.
export const AddWidgetMenu = observer(function AddWidgetMenu(props: Props) {
  const { workspaceSlug, availableWidgets } = props;
  const { t } = useTranslation();
  const { widgetsMap, toggleWidget, toggleWidgetSettings } = useHome();
  const hiddenWidgets = availableWidgets.filter((key) => !widgetsMap[key]?.is_enabled);

  if (hiddenWidgets.length === 0) return null;

  const handleAdd = (key: THomeWidgetKeys) => {
    toggleWidget(workspaceSlug, key, true).catch(() =>
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("home.widget.add_failed") })
    );
  };

  return (
    <CustomMenu
      customButton={
        <span className="flex h-full min-h-16 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-subtle px-4 py-3 text-13 text-tertiary transition-colors hover:border-strong hover:text-secondary">
          <Plus className="size-4" />
          {t("home.widget.add")}
        </span>
      }
      className="h-full w-full md:col-span-1"
      customButtonClassName="h-full w-full"
      placement="bottom-start"
      closeOnSelect
    >
      {hiddenWidgets.map((key) => (
        <CustomMenu.MenuItem key={key} onClick={() => handleAdd(key)}>
          {t(HOME_WIDGETS_LIST[key].title)}
        </CustomMenu.MenuItem>
      ))}
      <div className="my-1 border-t border-subtle" />
      <CustomMenu.MenuItem onClick={() => toggleWidgetSettings(true)}>{t("home.manage_widgets")}</CustomMenu.MenuItem>
    </CustomMenu>
  );
});
