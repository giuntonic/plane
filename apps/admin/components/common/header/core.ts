/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { i18nInstance } from "@plane/i18n";
export const CORE_HEADER_SEGMENT_LABELS: Record<string, string> = {
  get general() {
    return i18nInstance.t("ui.admin_menu_general");
  },
  get ai() {
    return i18nInstance.t("ui.artificial_intelligence");
  },
  get email() {
    return i18nInstance.t("ui.admin_menu_email");
  },
  get authentication() {
    return i18nInstance.t("ui.authentication");
  },
  get image() {
    return i18nInstance.t("ui.image");
  },
  google: "Google",
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
  get workspace() {
    return i18nInstance.t("common.workspace");
  },
  get create() {
    return i18nInstance.t("common.create");
  },
};
