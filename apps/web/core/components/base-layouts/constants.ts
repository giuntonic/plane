/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { i18nInstance } from "@plane/i18n";
import { BoardLayoutIcon, ListLayoutIcon, TimelineLayoutIcon } from "@plane/propel/icons";
import type { IBaseLayoutConfig } from "@plane/types";

export const BASE_LAYOUTS: IBaseLayoutConfig[] = [
  {
    key: "list",
    icon: ListLayoutIcon,
    get label() {
      return i18nInstance.t("ui.list_layout_2");
    },
  },
  {
    key: "kanban",
    icon: BoardLayoutIcon,
    get label() {
      return i18nInstance.t("ui.board_layout");
    },
  },
  {
    key: "gantt",
    icon: TimelineLayoutIcon,
    get label() {
      return i18nInstance.t("ui.gantt_layout");
    },
  },
];
