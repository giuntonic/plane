/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button, Input } from "@plane/ui";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// services
import projectMetabaseService from "@/services/project-metabase.service";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { DashboardProjectSettingsHeader } from "./header";

function DashboardSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentProjectDetails: projectDetails, updateProject } = useProject();
  const { t } = useTranslation();

  // derived values
  const canPerformProjectAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);

  // local form state
  const [dashboardId, setDashboardId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // preenche o form com o que já está salvo no projeto assim que carregar
  useEffect(() => {
    if (!projectDetails) return;
    setDashboardId(projectDetails.metabase_dashboard_id ?? "");
    setClienteId(projectDetails.metabase_cliente_id ?? "");
  }, [projectDetails?.metabase_dashboard_id, projectDetails?.metabase_cliente_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: embed, mutate: mutateEmbed } = useSWR(
    showPreview && workspaceSlug && projectId ? `PROJECT_METABASE_EMBED_SETTINGS_${workspaceSlug}_${projectId}` : null,
    () => projectMetabaseService.fetchEmbed(workspaceSlug, projectId)
  );

  const isDirty =
    dashboardId !== (projectDetails?.metabase_dashboard_id ?? "") ||
    clienteId !== (projectDetails?.metabase_cliente_id ?? "");

  const handleSave = async () => {
    if (!projectDetails) return;
    setSaving(true);
    try {
      await updateProject(workspaceSlug, projectId, {
        metabase_dashboard_id: dashboardId.trim() || null,
        metabase_cliente_id: clienteId.trim() || null,
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Sucesso!", message: t("project_settings.dashboard.saved") });
      if (showPreview) mutateEmbed();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("project_settings.dashboard.save_error") });
    } finally {
      setSaving(false);
    }
  };

  const pageTitle = projectDetails?.name
    ? `${projectDetails?.name} - ${t("project_settings.dashboard.label")}`
    : undefined;

  if (workspaceUserInfo && !canPerformProjectAdminActions) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<DashboardProjectSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <section className="w-full">
        <SettingsHeading
          title={t("project_settings.dashboard.heading")}
          description={t("project_settings.dashboard.description")}
        />
        <div className="mt-6 flex max-w-120 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-13 font-medium text-primary">{t("project_settings.dashboard.dashboard_id")}</label>
            <Input
              type="text"
              value={dashboardId}
              onChange={(e) => setDashboardId(e.target.value)}
              placeholder={t("project_settings.dashboard.dashboard_id_placeholder")}
              disabled={!canPerformProjectAdminActions}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-13 font-medium text-primary">{t("project_settings.dashboard.cliente_id")}</label>
            <Input
              type="text"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              placeholder={t("project_settings.dashboard.cliente_id_placeholder")}
              disabled={!canPerformProjectAdminActions}
            />
            <p className="text-12 text-tertiary">{t("project_settings.dashboard.cliente_id_description")}</p>
          </div>
          {canPerformProjectAdminActions && (
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving || !isDirty}>
                {t("project_settings.dashboard.save")}
              </Button>
              {projectDetails?.metabase_dashboard_id && (
                <Button variant="neutral-primary" onClick={() => setShowPreview((prev) => !prev)}>
                  {t("project_settings.dashboard.preview")}
                </Button>
              )}
            </div>
          )}
        </div>

        {showPreview && (
          <div className="mt-6 max-w-160">
            {embed?.configured && embed.url ? (
              <iframe key={embed.url} src={embed.url} title="Dashboard preview" className="h-100 w-full rounded-md border border-subtle" />
            ) : (
              <p className="text-13 text-tertiary">{t("project_settings.dashboard.not_configured")}</p>
            )}
          </div>
        )}
      </section>
    </SettingsContentWrapper>
  );
}

export default observer(DashboardSettingsPage);
