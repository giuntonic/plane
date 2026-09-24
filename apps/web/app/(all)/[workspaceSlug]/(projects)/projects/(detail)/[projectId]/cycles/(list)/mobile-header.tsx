/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { i18nInstance, useTranslation } from "@plane/i18n";
import type React from "react";
import { observer } from "mobx-react";
// ui
import type { ISvgIcons } from "@plane/propel/icons";
import { TimelineLayoutIcon, GridLayoutIcon, ListLayoutIcon } from "@plane/propel/icons";
// plane package imports
import type { TCycleLayoutOptions } from "@plane/types";
import { CustomMenu } from "@plane/ui";
// hooks
import { useCycleFilter } from "@/hooks/store/use-cycle-filter";
import { useProject } from "@/hooks/store/use-project";

const CYCLE_VIEW_LAYOUTS: {
  key: TCycleLayoutOptions;
  icon: React.FC<ISvgIcons>;
  title: string;
}[] = [
  {
    key: "list",
    icon: ListLayoutIcon,
    get title() {
      return i18nInstance.t("ui.list_layout");
    },
  },
  {
    key: "board",
    icon: GridLayoutIcon,
    get title() {
      return i18nInstance.t("ui.gallery_layout");
    },
  },
  {
    key: "gantt",
    icon: TimelineLayoutIcon,
    get title() {
      return i18nInstance.t("ui.timeline_layout");
    },
  },
];

export const CyclesListMobileHeader = observer(function CyclesListMobileHeader() {
  const { t } = useTranslation();
  const { currentProjectDetails } = useProject();
  // hooks
  const { updateDisplayFilters } = useCycleFilter();
  return (
    <div className="flex justify-center sm:hidden">
      <CustomMenu
        maxHeight={"md"}
        className="flex flex-grow justify-center border-b border-subtle bg-surface-1 py-2 text-13 text-secondary"
        // placement="bottom-start"
        customButton={
          <span className="flex items-center gap-2">
            <ListLayoutIcon className="h-4 w-4" />
            <span className="flex flex-grow justify-center text-13 text-secondary">{t("ui.layout")}</span>
          </span>
        }
        customButtonClassName="flex flex-grow justify-center items-center text-secondary text-13"
        closeOnSelect
      >
        {CYCLE_VIEW_LAYOUTS.map((layout) => {
          if (layout.key == "gantt") return;
          return (
            <CustomMenu.MenuItem
              key={layout.key}
              onClick={() => {
                updateDisplayFilters(currentProjectDetails!.id, {
                  layout: layout.key,
                });
              }}
              className="flex items-center gap-2"
            >
              <layout.icon className="h-3 w-3" />
              <div className="text-tertiary">{layout.title}</div>
            </CustomMenu.MenuItem>
          );
        })}
      </CustomMenu>
    </div>
  );
});
