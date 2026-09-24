/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { i18nInstance } from "@plane/i18n";
import { Image, BrainCog, Cog, Mail } from "lucide-react";
// plane imports
import { LockIcon, WorkspaceIcon } from "@plane/propel/icons";
// types
import type { TSidebarMenuItem } from "./types";

export type TCoreSidebarMenuKey = "general" | "email" | "workspace" | "authentication" | "ai" | "image";

export const coreSidebarMenuLinks: Record<TCoreSidebarMenuKey, TSidebarMenuItem> = {
  general: {
    Icon: Cog,
    get name() {
      return i18nInstance.t("ui.admin_menu_general");
    },
    get description() {
      return i18nInstance.t("ui.identify_your_instances_and_get_key_details");
    },
    href: `/general/`,
  },
  email: {
    Icon: Mail,
    get name() {
      return i18nInstance.t("ui.admin_menu_email");
    },
    get description() {
      return i18nInstance.t("ui.configure_your_smtp_controls");
    },
    href: `/email/`,
  },
  workspace: {
    Icon: WorkspaceIcon,
    get name() {
      return i18nInstance.t("ui.admin_menu_workspaces");
    },
    get description() {
      return i18nInstance.t("ui.manage_all_workspaces_on_this_instance");
    },
    href: `/workspace/`,
  },
  authentication: {
    Icon: LockIcon,
    get name() {
      return i18nInstance.t("ui.admin_menu_authentication");
    },
    get description() {
      return i18nInstance.t("ui.configure_authentication_modes");
    },
    href: `/authentication/`,
  },
  ai: {
    Icon: BrainCog,
    get name() {
      return i18nInstance.t("ui.admin_menu_ai");
    },
    get description() {
      return i18nInstance.t("ui.configure_your_openai_creds");
    },
    href: `/ai/`,
  },
  image: {
    Icon: Image,
    get name() {
      return i18nInstance.t("ui.images_in_plane");
    },
    get description() {
      return i18nInstance.t("ui.allow_third_party_image_libraries");
    },
    href: `/image/`,
  },
};
