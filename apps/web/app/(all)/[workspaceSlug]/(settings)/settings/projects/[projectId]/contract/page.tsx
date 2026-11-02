/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: o contrato do cliente do projeto, só para ver. Mostra o contrato que o painel de peças usa agora (do
// portal ou do Hub, conforme PESPO_CONTRACTS_SOURCE) e o que já foi importado para o Hub, com o histórico. Novo
// cliente e renovação continuam no painel admin até a mudança terminar.
import { observer } from "mobx-react";
import useSWR from "swr";
import { AlertTriangle } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProjectContractView } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { projectPiecesService } from "@/services/project-pieces.service";
// local imports
import type { Route } from "./+types/page";
import { ContractProjectSettingsHeader } from "./header";

const cellClass = "px-3 py-2 text-left";

type THubContract = NonNullable<TProjectContractView["hub"]>["contracts"][number];

function StatusChip({ status }: { status: THubContract["status"] }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn("rounded-sm px-1.5 text-caption-sm-medium", {
        "bg-success-subtle text-success-primary": status === "active",
        "bg-layer-1 text-secondary": status === "renewed",
        "bg-danger-subtle text-danger-primary": status === "expired",
      })}
    >
      {t(`project_settings.contract.status_${status}`)}
    </span>
  );
}

function ProjectContractSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { t } = useTranslation();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentProjectDetails } = useProject();
  const canView = allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.PROJECT);
  const { data, error, isLoading } = useSWR(canView ? ["PROJECT_CONTRACT", workspaceSlug, projectId] : null, () =>
    projectPiecesService.contract(workspaceSlug, projectId)
  );

  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails?.name} ${t("settings").toLowerCase()} - ${t("project_settings.contract.short_title")}`
    : undefined;
  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  const contract = data?.current?.contract ?? null;
  const expiring = data?.current?.expiring ?? null;

  return (
    <SettingsContentWrapper header={<ContractProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <section className="w-full">
        <SettingsHeading
          title={t("project_settings.contract.title")}
          description={t("project_settings.contract.description")}
        />
        {error ? (
          <p className="mt-7 text-body-sm-regular text-danger-primary">{t("project_settings.contract.error")}</p>
        ) : isLoading || !data ? (
          <Loader className="mt-7 flex max-w-2xl flex-col gap-3">
            <Loader.Item height="96px" />
            <Loader.Item height="160px" />
          </Loader>
        ) : (
          <div className="mt-7 flex max-w-2xl flex-col gap-8">
            {/* Contrato que o Hub usa agora */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-body-sm-medium text-primary">{t("project_settings.contract.current")}</h3>
                <span className="rounded-sm bg-layer-1 px-1.5 text-caption-sm-regular text-secondary">
                  {t(`project_settings.contract.source_${data.source}`)}
                </span>
              </div>
              {data.current_status === "unavailable" ? (
                <p className="text-body-sm-regular text-tertiary">
                  {t("project_settings.contract.portal_unavailable")}
                </p>
              ) : data.current_status === "no_client" || !data.current ? (
                <p className="text-body-sm-regular text-tertiary">{t("project_settings.contract.no_client")}</p>
              ) : (
                <div className="rounded-lg border border-subtle p-4">
                  <p className="text-body-md-medium text-primary">{data.current.client_name}</p>
                  {contract ? (
                    <>
                      <p className="mt-0.5 text-body-sm-regular text-secondary">
                        {t("project_settings.contract.period", {
                          type: contract.type,
                          start: renderFormattedDate(contract.start_date),
                          end: renderFormattedDate(contract.end_date),
                        })}
                        {" · "}
                        {t("project_settings.contract.urgent_limit", { count: contract.urgent_limit })}
                      </p>
                      {expiring && expiring.days_left <= 14 && (
                        <p className="mt-2 flex items-center gap-1.5 text-body-xs-medium text-warning-primary">
                          <AlertTriangle className="size-3.5" />
                          {expiring.days_left < 0
                            ? t("project_settings.contract.expired_on", {
                                date: renderFormattedDate(expiring.end_date),
                              })
                            : t("project_settings.contract.expires_in", { count: expiring.days_left })}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {contract.categories.map((category) => (
                          <div key={category.category} className="rounded-md bg-layer-1 px-3 py-1.5">
                            <p className="text-caption-sm-regular text-tertiary">{category.category}</p>
                            <p className="text-body-sm-medium text-primary tabular-nums">{category.contracted}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="mt-0.5 text-body-sm-regular text-tertiary">
                      {t("project_settings.contract.no_active")}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* O que já está no Hub */}
            <div className="flex flex-col gap-3">
              <h3 className="text-body-sm-medium text-primary">{t("project_settings.contract.history")}</h3>
              {!data.hub ? (
                <p className="text-body-sm-regular text-tertiary">{t("project_settings.contract.not_imported")}</p>
              ) : data.hub.contracts.length === 0 ? (
                <p className="text-body-sm-regular text-tertiary">{t("project_settings.contract.no_contracts")}</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-subtle">
                  <table className="w-full min-w-[560px] text-body-xs-regular">
                    <thead className="bg-layer-1 text-tertiary">
                      <tr>
                        <th className={cellClass}>{t("project_settings.contract.col_period")}</th>
                        <th className={cellClass}>{t("project_settings.contract.col_type")}</th>
                        <th className={cellClass}>{t("project_settings.contract.col_status")}</th>
                        <th className={cellClass}>{t("project_settings.contract.col_categories")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle">
                      {data.hub.contracts.map((item) => (
                        <tr key={item.id}>
                          <td className={cn(cellClass, "text-primary")}>
                            {renderFormattedDate(item.start_date)} – {renderFormattedDate(item.end_date)}
                          </td>
                          <td className={cellClass}>{item.contract_type}</td>
                          <td className={cellClass}>
                            <StatusChip status={item.status} />
                          </td>
                          <td className={cn(cellClass, "text-secondary")}>
                            {item.categories
                              .map((category) => `${category.category} ${category.contracted}`)
                              .join(", ") || "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.hub && (
                <p className="text-caption-sm-regular text-placeholder">
                  {t("project_settings.contract.imported_at", { date: renderFormattedDate(data.hub.imported_at) })}
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </SettingsContentWrapper>
  );
}

export default observer(ProjectContractSettingsPage);
