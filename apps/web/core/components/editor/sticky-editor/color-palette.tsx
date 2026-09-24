/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { i18nInstance, useTranslation } from "@plane/i18n";
import type { TSticky } from "@plane/types";

export const STICKY_COLORS_LIST: {
  key: string;
  label: string;
  backgroundColor: string;
}[] = [
  {
    key: "gray",
    get label() {
      return i18nInstance.t("ui.gray");
    },
    backgroundColor: "var(--editor-colors-gray-background)",
  },
  {
    key: "peach",
    get label() {
      return i18nInstance.t("ui.peach");
    },
    backgroundColor: "var(--editor-colors-peach-background)",
  },
  {
    key: "pink",
    get label() {
      return i18nInstance.t("ui.pink");
    },
    backgroundColor: "var(--editor-colors-pink-background)",
  },
  {
    key: "orange",
    get label() {
      return i18nInstance.t("ui.orange");
    },
    backgroundColor: "var(--editor-colors-orange-background)",
  },
  {
    key: "green",
    get label() {
      return i18nInstance.t("ui.green");
    },
    backgroundColor: "var(--editor-colors-green-background)",
  },
  {
    key: "light-blue",
    get label() {
      return i18nInstance.t("ui.light_blue");
    },
    backgroundColor: "var(--editor-colors-light-blue-background)",
  },
  {
    key: "dark-blue",
    get label() {
      return i18nInstance.t("ui.dark_blue");
    },
    backgroundColor: "var(--editor-colors-dark-blue-background)",
  },
  {
    key: "purple",
    get label() {
      return i18nInstance.t("ui.purple");
    },
    backgroundColor: "var(--editor-colors-purple-background)",
  },
];

type TProps = {
  handleUpdate: (data: Partial<TSticky>) => Promise<void>;
};

export function ColorPalette(props: TProps) {
  const { t } = useTranslation();
  const { handleUpdate } = props;
  return (
    <div className="shadow absolute bottom-5 left-0 z-10 mb-2 w-56 rounded-md bg-surface-1 p-2">
      <div className="mb-2 text-13 font-semibold text-placeholder">{t("ui.background_colors")}</div>
      <div className="flex flex-wrap gap-2">
        {STICKY_COLORS_LIST.map((color) => (
          <button
            key={color.key}
            type="button"
            onClick={() => {
              handleUpdate({
                background_color: color.key,
              });
            }}
            className="h-6 w-6 rounded-md transition-all hover:ring-2 hover:ring-accent-strong focus:ring-2 focus:ring-accent-strong focus:outline-none"
            style={{
              backgroundColor: color.backgroundColor,
            }}
          />
        ))}
      </div>
    </div>
  );
}
