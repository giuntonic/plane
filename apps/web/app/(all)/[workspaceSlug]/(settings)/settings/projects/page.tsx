/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { useTheme } from "next-themes";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button, getButtonStyling } from "@plane/propel/button";
import { cn } from "@plane/utils";
// assets
import ProjectDarkEmptyState from "@/app/assets/empty-state/project-settings/no-projects-dark.png?url";
import ProjectLightEmptyState from "@/app/assets/empty-state/project-settings/no-projects-light.png?url";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";

function ProjectSettingsPage() {
  // store hooks
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const { toggleCreateProjectModal } = useCommandPalette();
  // derived values
  const resolvedPath = resolvedTheme === "dark" ? ProjectDarkEmptyState : ProjectLightEmptyState;
  return (
    <div className="mx-auto flex h-full max-w-[480px] flex-col items-center justify-center gap-4">
      <img src={resolvedPath} alt={t("settings_projects_empty.title")} />
      <div className="text-16 font-semibold text-tertiary">{t("settings_projects_empty.title")}</div>
      <div className="text-center text-13 text-tertiary">
        {t("settings_projects_empty.description")}
      </div>
      <div className="flex gap-2">
        <Link href="https://plane.so/" target="_blank" className={cn(getButtonStyling("secondary", "base"))}>
          {t("settings_projects_empty.learn_more")}
        </Link>
        <Button onClick={() => toggleCreateProjectModal(true)}>{t("start_first_project")}</Button>
      </div>
    </div>
  );
}

export default observer(ProjectSettingsPage);
