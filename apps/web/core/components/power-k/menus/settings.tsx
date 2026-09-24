/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
// local imports
import { PowerKMenuBuilder } from "./builder";

type TSettingItem = {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
};

type Props = {
  settings: TSettingItem[];
  onSelect: (setting: TSettingItem) => void;
};

export const PowerKSettingsMenu = observer(function PowerKSettingsMenu({ settings, onSelect }: Props) {
  const { t } = useTranslation();
  return (
    <PowerKMenuBuilder
      items={settings}
      getKey={(setting) => setting.key}
      getIcon={(setting) => setting.icon}
      getValue={(setting) => setting.label}
      getLabel={(setting) => setting.label}
      onSelect={onSelect}
      emptyText={t("power_k.search_menu.no_settings_found")}
    />
  );
});
