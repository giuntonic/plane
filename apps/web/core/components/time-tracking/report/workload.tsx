/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: a carga da equipe agora. Por pessoa: itens abertos (e quantos em produção), atrasados, vencendo nos
// próximos 7 dias, subtarefas abertas e as horas lançadas na semana. Abrir a linha mostra os próximos prazos.
import { Fragment, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { AlertTriangle, ChevronRight } from "lucide-react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { CustomSelect, Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
// components
import { formatDuration } from "@/components/issues/time-tracking/helpers";
// hooks
import { useProject } from "@/hooks/store/use-project";
// services
import { timeTrackingService } from "@/services/time-tracking.service";

const cellClass = "px-3 py-2 text-left";

export const TeamWorkloadReport = observer(function TeamWorkloadReport() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { t } = useTranslation();
  const { workspaceProjectIds, getProjectById } = useProject();
  const [projectId, setProjectId] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const projects = useMemo(
    () =>
      (workspaceProjectIds ?? [])
        .map((id) => getProjectById(id))
        .filter((project): project is NonNullable<typeof project> => !!project)
        // oxlint-disable-next-line unicorn/no-array-sort -- cópia nova do map acima
        .sort((a, b) => a.name.localeCompare(b.name)),
    [workspaceProjectIds, getProjectById]
  );
  const { data, error, isLoading } = useSWR(
    slug ? ["WORKLOAD", slug, projectId] : null,
    () => timeTrackingService.workload(slug, projectId || undefined),
    { revalidateOnFocus: true, keepPreviousData: true }
  );
  const maxOpen = Math.max(1, ...(data?.people ?? []).map((person) => person.open));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-body-sm-regular text-tertiary">{t("pespo_reports.workload.description")}</p>
        <CustomSelect
          value={projectId}
          label={
            <span className="truncate">
              {projectId ? getProjectById(projectId)?.name : t("pespo_reports.workload.all_projects")}
            </span>
          }
          onChange={(value: string) => setProjectId(value)}
          buttonClassName="rounded-md border border-subtle px-2 py-1 text-body-xs-regular"
          className="ml-auto"
          maxHeight="lg"
        >
          <CustomSelect.Option value="">{t("pespo_reports.workload.all_projects")}</CustomSelect.Option>
          {projects.map((project) => (
            <CustomSelect.Option key={project.id} value={project.id}>
              {project.name}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      </div>
      {error ? (
        <p className="text-body-sm-regular text-danger-primary">{t("pespo_reports.workload.error")}</p>
      ) : isLoading && !data ? (
        <Loader className="flex flex-col gap-2">
          <Loader.Item height="40px" />
          <Loader.Item height="40px" />
          <Loader.Item height="40px" />
        </Loader>
      ) : !data || data.people.length === 0 ? (
        <p className="text-body-sm-regular text-tertiary">{t("pespo_reports.workload.empty")}</p>
      ) : (
        <div className={cn("overflow-x-auto rounded-lg border border-subtle", { "opacity-60": isLoading })}>
          <table className="w-full min-w-[720px] text-body-xs-regular">
            <thead className="bg-layer-1 text-tertiary">
              <tr>
                <th className={cellClass}>{t("pespo_reports.workload.person")}</th>
                <th className={cn(cellClass, "w-48")}>{t("pespo_reports.workload.open")}</th>
                <th className={cellClass}>{t("pespo_reports.workload.overdue")}</th>
                <th className={cellClass}>{t("pespo_reports.workload.due_soon")}</th>
                <th className={cellClass}>{t("pespo_reports.workload.subtasks")}</th>
                <th className={cellClass}>{t("pespo_reports.workload.week_hours")}</th>
                <th className={cellClass}>{t("pespo_reports.workload.clients")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {data.people.map((person) => {
                const expanded = openRow === person.id;
                return (
                  <Fragment key={person.id}>
                    <tr className="hover:bg-layer-transparent-hover">
                      <td className={cellClass}>
                        <button
                          type="button"
                          onClick={() => setOpenRow(expanded ? null : person.id)}
                          className="flex items-center gap-1 text-primary"
                          aria-expanded={expanded}
                        >
                          <ChevronRight
                            className={cn("size-3.5 text-tertiary transition-transform", { "rotate-90": expanded })}
                          />
                          {person.display_name}
                        </button>
                      </td>
                      <td className={cellClass}>
                        <div className="flex items-center gap-2">
                          <span className="w-6 text-primary tabular-nums">{person.open}</span>
                          <div className="h-1.5 flex-1 rounded-full bg-layer-3">
                            <div
                              className="h-1.5 rounded-full bg-accent-primary"
                              style={{ width: `${(person.open / maxOpen) * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-caption-sm-regular text-tertiary">
                          {t("pespo_reports.workload.started", { count: person.started })}
                        </span>
                      </td>
                      <td className={cellClass}>
                        {person.overdue > 0 ? (
                          <span className="flex items-center gap-1 text-danger-primary">
                            <AlertTriangle className="size-3" />
                            {person.overdue}
                          </span>
                        ) : (
                          <span className="text-placeholder">0</span>
                        )}
                      </td>
                      <td
                        className={cn(cellClass, "tabular-nums", person.due_soon ? "text-primary" : "text-placeholder")}
                      >
                        {person.due_soon}
                      </td>
                      <td className={cellClass}>
                        <span className={person.subtasks_open ? "text-primary" : "text-placeholder"}>
                          {person.subtasks_open}
                        </span>
                        {person.subtasks_overdue > 0 && (
                          <span className="ml-1 text-caption-sm-regular text-danger-primary">
                            {t("pespo_reports.workload.subtasks_overdue", { count: person.subtasks_overdue })}
                          </span>
                        )}
                      </td>
                      <td className={cn(cellClass, "text-primary tabular-nums")}>
                        {person.week_seconds ? (
                          formatDuration(person.week_seconds)
                        ) : (
                          <span className="text-placeholder">–</span>
                        )}
                      </td>
                      <td className={cellClass}>
                        <div className="flex flex-wrap gap-1">
                          {person.projects.map((project) => (
                            <span
                              key={project.identifier}
                              className="rounded-sm bg-layer-1 px-1.5 text-caption-sm-regular text-secondary"
                            >
                              {project.identifier} {project.count}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={7} className="bg-layer-1 px-3 py-2">
                          <h4 className="pb-1 text-caption-sm-medium text-tertiary">
                            {t("pespo_reports.workload.upcoming")}
                          </h4>
                          {person.upcoming.length === 0 ? (
                            <p className="text-tertiary">{t("pespo_reports.workload.no_upcoming")}</p>
                          ) : (
                            <ul className="flex flex-col gap-0.5">
                              {person.upcoming.map((item) => (
                                <li key={item.id} className="flex gap-3">
                                  <span
                                    className={cn(
                                      "w-24 shrink-0",
                                      item.overdue ? "text-danger-primary" : "text-tertiary"
                                    )}
                                  >
                                    {renderFormattedDate(item.target_date)}
                                  </span>
                                  <a
                                    href={`/${slug}/browse/${item.project_identifier}-${item.sequence_id}/`}
                                    className="truncate text-primary hover:underline"
                                  >
                                    {item.name}
                                  </a>
                                  <span className="shrink-0 text-tertiary">
                                    {item.project_identifier}-{item.sequence_id}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
