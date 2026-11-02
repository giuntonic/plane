/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: relatório de horas do espaço de trabalho. Período, projeto (cada cliente é um projeto) e pessoa;
// totais por pessoa, por projeto e por item; e o CSV com os lançamentos. Quem é admin vê todos; os outros
// membros, só as próprias horas (o servidor filtra).
import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Download } from "lucide-react";
import useSWR from "swr";
import { endOfMonth, format, startOfMonth, startOfWeek, subDays, subMonths } from "date-fns";
// plane imports
import { useTranslation } from "@plane/i18n";
import { getButtonStyling } from "@plane/propel/button";
import type { TTimeReport, TTimeReportParams } from "@plane/types";
import { CustomSelect, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { formatDuration } from "@/components/issues/time-tracking/helpers";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
// services
import { timeTrackingService } from "@/services/time-tracking.service";

type TPreset = "this_week" | "this_month" | "last_month" | "last_30_days" | "custom";

const PRESETS: TPreset[] = ["this_week", "this_month", "last_month", "last_30_days", "custom"];

const day = (date: Date) => format(date, "yyyy-MM-dd");

function presetRange(preset: Exclude<TPreset, "custom">, today = new Date()) {
  switch (preset) {
    case "this_week":
      return { start: day(startOfWeek(today, { weekStartsOn: 1 })), end: day(today) };
    case "last_month": {
      const last = subMonths(today, 1);
      return { start: day(startOfMonth(last)), end: day(endOfMonth(last)) };
    }
    case "last_30_days":
      return { start: day(subDays(today, 29)), end: day(today) };
    default:
      return { start: day(startOfMonth(today)), end: day(today) };
  }
}

type TRow = { key: string; label: React.ReactNode; hint?: string; seconds: number };

function ReportTable({ title, column, rows, total }: { title: string; column: string; rows: TRow[]; total: number }) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-body-sm-medium text-primary">{title}</h3>
      <div className="overflow-hidden rounded-lg border border-subtle">
        <table className="w-full text-body-xs-regular">
          <thead className="bg-layer-1 text-tertiary">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{column}</th>
              <th className="hidden w-1/3 px-3 py-2 text-left font-medium sm:table-cell">
                {t("time_tracking.report.share")}
              </th>
              <th className="w-28 px-3 py-2 text-right font-medium">{t("time_tracking.report.hours")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle">
            {rows.map((row) => {
              const share = total ? row.seconds / total : 0;
              return (
                <tr key={row.key}>
                  <td className="max-w-0 px-3 py-2">
                    <div className="truncate text-primary">{row.label}</div>
                    {row.hint && <div className="truncate text-caption-sm-regular text-tertiary">{row.hint}</div>}
                  </td>
                  <td className="hidden px-3 py-2 sm:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-layer-3">
                        <div
                          className="h-1.5 rounded-full bg-accent-primary"
                          style={{ width: `${Math.max(share * 100, 1)}%` }}
                        />
                      </div>
                      <span className="w-9 text-right text-tertiary tabular-nums">{Math.round(share * 100)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-primary tabular-nums">{formatDuration(row.seconds)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-subtle px-4 py-3">
      <span className="text-caption-sm-regular text-tertiary">{label}</span>
      <span className="text-h4-medium text-primary tabular-nums">{value}</span>
    </div>
  );
}

export const TimeReportRoot = observer(function TimeReportRoot() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { t } = useTranslation();
  const { workspaceProjectIds, getProjectById } = useProject();
  const {
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();
  const [preset, setPreset] = useState<TPreset>("this_month");
  const [custom, setCustom] = useState(() => presetRange("this_month"));
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");

  const period = preset === "custom" ? custom : presetRange(preset);
  const params: TTimeReportParams = {
    start: period.start,
    end: period.end,
    project: projectId || undefined,
    user: userId || undefined,
  };
  const isValidPeriod = !!params.start && !!params.end && params.start <= params.end;
  const { data, error, isLoading } = useSWR<TTimeReport>(
    slug && isValidPeriod ? ["TIME_REPORT", slug, JSON.stringify(params)] : null,
    () => timeTrackingService.report(slug, params),
    { keepPreviousData: true, revalidateOnFocus: false }
  );

  const projectOptions = useMemo(
    () =>
      (workspaceProjectIds ?? [])
        .map((id) => getProjectById(id))
        .filter((project): project is NonNullable<typeof project> => !!project)
        // oxlint-disable-next-line unicorn/no-array-sort -- cópia nova do map acima
        .sort((a, b) => a.name.localeCompare(b.name)),
    [workspaceProjectIds, getProjectById]
  );
  const memberOptions = useMemo(
    () =>
      (workspaceMemberIds ?? [])
        .map((id) => getWorkspaceMemberDetails(id))
        .filter((member): member is NonNullable<typeof member> => !!member && member.role !== 5)
        // oxlint-disable-next-line unicorn/no-array-sort -- cópia nova do map acima
        .sort((a, b) => (a.member.display_name ?? "").localeCompare(b.member.display_name ?? "")),
    [workspaceMemberIds, getWorkspaceMemberDetails]
  );

  const total = data?.total_seconds ?? 0;
  const personRows: TRow[] = (data?.by_user ?? []).map((row) => ({
    key: row.id,
    label: row.display_name,
    hint: row.full_name && row.full_name !== row.display_name ? row.full_name : undefined,
    seconds: row.seconds,
  }));
  const projectRows: TRow[] = (data?.by_project ?? []).map((row) => ({
    key: row.id,
    label: row.name,
    hint: row.identifier,
    seconds: row.seconds,
  }));
  const itemRows: TRow[] = (data?.by_issue ?? []).map((row) => ({
    key: row.id,
    label: (
      <a href={`/${slug}/browse/${row.project_identifier}-${row.sequence_id}/`} className="hover:underline">
        {row.name}
      </a>
    ),
    hint: `${row.project_identifier}-${row.sequence_id}`,
    seconds: row.seconds,
  }));

  const selectButton = "rounded-md border border-subtle px-2 py-1 text-body-xs-regular";
  const projectLabel = projectId ? getProjectById(projectId)?.name : t("time_tracking.report.all_projects");
  const memberLabel = userId
    ? getWorkspaceMemberDetails(userId)?.member.display_name
    : t("time_tracking.report.all_people");

  return (
    <div className="flex flex-col gap-6">
      <p className="text-body-sm-regular text-tertiary">
        {data && !data.is_admin ? t("time_tracking.report.only_mine") : t("time_tracking.report.description")}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-md bg-layer-1 p-0.5">
          {PRESETS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                if (option === "custom" && preset !== "custom") setCustom(period);
                setPreset(option);
              }}
              className={cn(
                "rounded-sm px-2 py-1 text-body-xs-medium",
                preset === option ? "bg-layer-3 text-primary shadow-raised-100" : "text-tertiary hover:text-primary"
              )}
            >
              {t(`time_tracking.report.${option}`)}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-1 text-body-xs-regular text-tertiary">
            <label className="flex items-center gap-1">
              {t("time_tracking.report.from")}
              <input
                type="date"
                value={custom.start}
                max={custom.end}
                onChange={(event) => setCustom((prev) => ({ ...prev, start: event.target.value }))}
                className={cn(selectButton, "bg-transparent text-primary")}
              />
            </label>
            <label className="flex items-center gap-1">
              {t("time_tracking.report.to")}
              <input
                type="date"
                value={custom.end}
                min={custom.start}
                onChange={(event) => setCustom((prev) => ({ ...prev, end: event.target.value }))}
                className={cn(selectButton, "bg-transparent text-primary")}
              />
            </label>
          </div>
        )}
        <CustomSelect
          value={projectId}
          label={<span className="truncate">{projectLabel}</span>}
          onChange={(value: string) => setProjectId(value)}
          buttonClassName={selectButton}
          maxHeight="lg"
        >
          <CustomSelect.Option value="">{t("time_tracking.report.all_projects")}</CustomSelect.Option>
          {projectOptions.map((project) => (
            <CustomSelect.Option key={project.id} value={project.id}>
              {project.name}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
        {data?.is_admin && (
          <CustomSelect
            value={userId}
            label={<span className="truncate">{memberLabel}</span>}
            onChange={(value: string) => setUserId(value)}
            buttonClassName={selectButton}
            maxHeight="lg"
          >
            <CustomSelect.Option value="">{t("time_tracking.report.all_people")}</CustomSelect.Option>
            {memberOptions.map((member) => (
              <CustomSelect.Option key={member.member.id} value={member.member.id}>
                {member.member.display_name}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        )}
        <a
          href={isValidPeriod ? timeTrackingService.exportUrl(slug, params) : undefined}
          aria-disabled={!isValidPeriod || !total}
          className={cn(getButtonStyling("secondary", "base"), "ml-auto gap-1.5", {
            "pointer-events-none opacity-60": !isValidPeriod || !total,
          })}
        >
          <Download className="size-3.5" />
          {t("time_tracking.report.export")}
        </a>
      </div>

      {!isValidPeriod ? (
        <p className="text-body-sm-regular text-danger-primary">{t("time_tracking.report.invalid_period")}</p>
      ) : error ? (
        <p className="text-body-sm-regular text-danger-primary">
          {error?.error === "PERIOD_TOO_LONG"
            ? t("time_tracking.report.invalid_period")
            : t("time_tracking.report.error")}
        </p>
      ) : isLoading && !data ? (
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="72px" />
          <Loader.Item height="160px" />
        </Loader>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label={t("time_tracking.report.total")} value={formatDuration(total)} />
            <StatTile label={t("time_tracking.report.items")} value={String(data.by_issue.length)} />
            <StatTile label={t("time_tracking.report.projects")} value={String(data.by_project.length)} />
            <StatTile label={t("time_tracking.report.people")} value={String(data.by_user.length)} />
          </div>
          {total === 0 ? (
            <p className="rounded-lg border border-dashed border-subtle px-4 py-10 text-center text-body-sm-regular text-tertiary">
              {t("time_tracking.report.empty")}
            </p>
          ) : (
            <div className={cn("flex flex-col gap-6", { "opacity-60": isLoading })}>
              {data.is_admin && (
                <ReportTable
                  title={t("time_tracking.report.by_person")}
                  column={t("time_tracking.report.person")}
                  rows={personRows}
                  total={total}
                />
              )}
              <ReportTable
                title={t("time_tracking.report.by_project")}
                column={t("time_tracking.report.project")}
                rows={projectRows}
                total={total}
              />
              <ReportTable
                title={t("time_tracking.report.by_item")}
                column={t("time_tracking.report.item")}
                rows={itemRows}
                total={total}
              />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
});
