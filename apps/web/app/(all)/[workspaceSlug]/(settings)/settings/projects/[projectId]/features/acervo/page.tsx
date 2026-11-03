/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: pasta do projeto no Acervo (Nextcloud, arquivos.pespo.com.br). Nasce sozinha com o projeto; cada peça que
// ganha um link tem uma subpasta com Recebido/ e Entrega/. Aqui o admin cria (projeto de antes) ou troca a pasta.
import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { ExternalLink, FolderOpen } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Loader } from "@plane/ui";
// components
import { AcervoFolderPickerModal } from "@/components/acervo/folder-picker-modal";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { getAcervoErrorKey } from "@/components/issues/issue-detail-widgets/acervo/helper";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { acervoService } from "@/services/acervo.service";
// local imports
import type { Route } from "./+types/page";
import { FeaturesAcervoProjectSettingsHeader } from "./header";

function FeaturesAcervoSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { t } = useTranslation();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentProjectDetails } = useProject();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const canPerformProjectAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);
  const { data, isLoading, mutate } = useSWR(
    canPerformProjectAdminActions ? ["PROJECT_ACERVO", projectId] : null,
    () => acervoService.getProject(workspaceSlug, projectId),
    { revalidateOnFocus: false }
  );

  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails?.name} ${t("settings").toLowerCase()} - ${t("project_settings.features.acervo.short_title")}`
    : undefined;
  if (workspaceUserInfo && !canPerformProjectAdminActions) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  const save = async (folder?: string) => {
    setIsSaving(true);
    try {
      await mutate(await acervoService.setProjectFolder(workspaceSlug, projectId, folder), { revalidate: false });
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("project_settings.features.acervo.saved") });
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t(getAcervoErrorKey(error)) });
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const folder = data?.folder;

  return (
    <SettingsContentWrapper header={<FeaturesAcervoProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <section className="w-full">
        <SettingsHeading
          title={t("project_settings.features.acervo.title")}
          description={t("project_settings.features.acervo.description")}
        />
        {isLoading || !data ? (
          <Loader className="mt-7 max-w-xl">
            <Loader.Item height="96px" />
          </Loader>
        ) : !data.enabled ? (
          <p className="mt-7 max-w-xl rounded-lg border border-subtle p-4 text-body-sm-regular text-secondary">
            {t("project_settings.features.acervo.disabled")}
          </p>
        ) : (
          <div className="mt-7 flex max-w-xl flex-col gap-4 rounded-lg border border-subtle p-4">
            <div className="flex items-center gap-3">
              <FolderOpen className="size-5 shrink-0 text-tertiary" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-sm-medium text-primary">
                  {folder ? `/${folder}` : t("project_settings.features.acervo.no_folder")}
                </span>
                <span className="text-body-xs-regular text-tertiary">
                  {folder
                    ? t("project_settings.features.acervo.folder_hint")
                    : t("project_settings.features.acervo.no_folder_hint", { path: `/${data.default_folder}` })}
                </span>
              </div>
              {data.files_url && (
                <a
                  href={data.files_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1 text-body-xs-medium text-accent-primary hover:underline"
                >
                  <ExternalLink className="size-3.5" />
                  {t("project_settings.features.acervo.open")}
                </a>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!folder && (
                <Button variant="primary" onClick={() => void save().catch(() => undefined)} disabled={isSaving}>
                  {t("project_settings.features.acervo.create")}
                </Button>
              )}
              <Button
                variant={folder ? "primary" : "secondary"}
                onClick={() => setIsPickerOpen(true)}
                disabled={isSaving}
              >
                {t("project_settings.features.acervo.change")}
              </Button>
            </div>
            <p className="text-body-xs-regular text-tertiary">{t("project_settings.features.acervo.structure_hint")}</p>
          </div>
        )}
      </section>
      <AcervoFolderPickerModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        isOpen={isPickerOpen}
        initialPath={folder ? folder.split("/").slice(0, -1).join("/") || undefined : undefined}
        onClose={() => setIsPickerOpen(false)}
        onSelect={save}
      />
    </SettingsContentWrapper>
  );
}

export default observer(FeaturesAcervoSettingsPage);
