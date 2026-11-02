/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: pasta do projeto no Google Drive. Os documentos novos criados pelos itens ("Anexar › Novo Google
// Docs…") vão para ela, com o nome do item. De preferência num Drive compartilhado da equipe: o Hub nunca
// compartilha arquivos, então quem não tem acesso à pasta não consegue criar nela.
import { useState } from "react";
import { observer } from "mobx-react";
import { ExternalLink, FolderOpen } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { GoogleDrivePickerModal } from "@/components/integration/google-drive/picker-modal";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { FeaturesGoogleDriveProjectSettingsHeader } from "./header";

function FeaturesGoogleDriveSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { t } = useTranslation();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentProjectDetails, updateProject } = useProject();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails?.name} ${t("settings").toLowerCase()} - ${t("project_settings.features.google_drive.short_title")}`
    : undefined;
  const canPerformProjectAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);
  if (workspaceUserInfo && !canPerformProjectAdminActions) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  const folderId = currentProjectDetails?.google_drive_folder_id;
  const folderName = currentProjectDetails?.google_drive_folder_name;

  const save = async (folder: { id: string; name: string } | null) => {
    setIsSaving(true);
    try {
      await updateProject(workspaceSlug, projectId, {
        google_drive_folder_id: folder?.id ?? "",
        google_drive_folder_name: folder?.name ?? "",
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("project_settings.features.google_drive.saved") });
      setIsPickerOpen(false);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("common.something_went_wrong") });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsContentWrapper header={<FeaturesGoogleDriveProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <section className="w-full">
        <SettingsHeading
          title={t("project_settings.features.google_drive.title")}
          description={t("project_settings.features.google_drive.description")}
        />
        <div className="mt-7 flex max-w-xl flex-col gap-4 rounded-lg border border-subtle p-4">
          <div className="flex items-center gap-3">
            <FolderOpen className="size-5 shrink-0 text-tertiary" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body-sm-medium text-primary">
                {folderId ? folderName || folderId : t("project_settings.features.google_drive.no_folder")}
              </span>
              <span className="text-body-xs-regular text-tertiary">
                {folderId
                  ? t("project_settings.features.google_drive.folder_hint")
                  : t("project_settings.features.google_drive.no_folder_hint")}
              </span>
            </div>
            {folderId && (
              <a
                href={`https://drive.google.com/drive/folders/${folderId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1 text-body-xs-medium text-accent-primary hover:underline"
              >
                <ExternalLink className="size-3.5" />
                {t("project_settings.features.google_drive.open")}
              </a>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setIsPickerOpen(true)} disabled={isSaving}>
              {folderId
                ? t("project_settings.features.google_drive.change")
                : t("project_settings.features.google_drive.choose")}
            </Button>
            {folderId && (
              <Button variant="secondary" onClick={() => void save(null)} disabled={isSaving}>
                {t("project_settings.features.google_drive.remove")}
              </Button>
            )}
          </div>
        </div>
      </section>
      <GoogleDrivePickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={() => undefined}
        onSelectFolder={save}
        newFolderName={currentProjectDetails?.name}
        title={t("project_settings.features.google_drive.picker_title")}
      />
    </SettingsContentWrapper>
  );
}

export default observer(FeaturesGoogleDriveSettingsPage);
