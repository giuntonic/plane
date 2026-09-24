/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { i18nInstance } from "@plane/i18n";
export const CORE_HEADER_SEGMENT_LABELS: Record<string, string> = {
  general: "General",
  get ai() {
    return i18nInstance.t("ui.artificial_intelligence");
  },
  email: "Email",
  authentication: "Authentication",
  image: "Image",
  google: "Google",
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
  workspace: "Workspace",
  create: "Create",
};
