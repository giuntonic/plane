/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: o mês de um cliente (cada cliente é um projeto): peças pedidas e entregues, prazos, refações, horas,
// reuniões e atas, e o saldo do contrato. "Imprimir / PDF" imprime só o relatório, sem as atas que são só da
// equipe (e sem as horas, a menos que se peça).
import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import useSWR from "swr";
import { addMonths, format, parse } from "date-fns";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CustomSelect, Loader, ToggleSwitch } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
// components
import { formatDuration } from "@/components/issues/time-tracking/helpers";
// hooks
import { useProject } from "@/hooks/store/use-project";
// services
import { timeTrackingService } from "@/services/time-tracking.service";

/** Imprime só o relatório numa janela limpa, com os estilos do Hub, para não sair cortado pela rolagem da página. */
function printReport(element: HTMLElement, title: string) {
  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) return window.print();
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("");
  const attributes = Array.from(document.documentElement.attributes)
    .filter((attribute) => attribute.name !== "data-theme")
    .map((attribute) => `${attribute.name}="${attribute.value.replace(/"/g, "&quot;")}"`)
    .join(" ");
  const safeTitle = title.replace(/[<>&]/g, "");
  win.document.write(
    `<!doctype html><html ${attributes} data-theme="light"><head><meta charset="utf-8"><title>${safeTitle}</title>${styles}` +
      `<style>body{background:#fff;padding:32px;overflow:visible!important}.pespo-no-print{display:none!important}` +
      `section{break-inside:avoid}</style></head><body>${element.outerHTML}</body></html>`
  );
  win.document.close();
  win.addEventListener("load", () => {
    win.focus();
    win.print();
  });
}

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-subtle px-4 py-3">
      <span className="text-caption-sm-regular text-tertiary">{label}</span>
      <span className="text-h4-medium text-primary tabular-nums">{value}</span>
      {detail && <span className="text-caption-sm-regular text-tertiary">{detail}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex break-inside-avoid flex-col gap-2">
      <h3 className="text-body-sm-medium text-primary">{title}</h3>
      {children}
    </section>
  );
}

const cellClass = "px-3 py-2 text-left";
const label = (identifier: string, sequence: number | null) => `${identifier}-${sequence ?? ""}`;

export const MonthlyClientReport = observer(function MonthlyClientReport() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { t } = useTranslation();
  const { workspaceProjectIds, getProjectById } = useProject();
  const projects = useMemo(
    () =>
      (workspaceProjectIds ?? [])
        .map((id) => getProjectById(id))
        .filter((project): project is NonNullable<typeof project> => !!project)
        // oxlint-disable-next-line unicorn/no-array-sort -- cópia nova do map acima
        .sort((a, b) => a.name.localeCompare(b.name)),
    [workspaceProjectIds, getProjectById]
  );
  const [projectId, setProjectId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [includeHours, setIncludeHours] = useState<boolean | null>(null);
  const selected = projectId ?? projects[0]?.id ?? null;

  const { data, error, isLoading } = useSWR(
    slug && selected ? ["MONTHLY_REPORT", slug, selected, month] : null,
    () => timeTrackingService.monthlyReport(slug, selected as string, month),
    { revalidateOnFocus: false, keepPreviousData: true }
  );
  const showHours = includeHours ?? !!data?.hours.client_visible;
  const monthDate = parse(month, "yyyy-MM", new Date());
  const monthLabel = monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const isCurrentMonth = month === format(new Date(), "yyyy-MM");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          value={selected}
          label={
            <span className="truncate">
              {getProjectById(selected ?? "")?.name ?? t("pespo_reports.client.choose_project")}
            </span>
          }
          onChange={(value: string) => setProjectId(value)}
          buttonClassName="rounded-md border border-subtle px-2 py-1 text-body-xs-regular"
          maxHeight="lg"
        >
          {projects.map((project) => (
            <CustomSelect.Option key={project.id} value={project.id}>
              {project.name}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
        <div className="flex items-center rounded-md border border-subtle">
          <button
            type="button"
            aria-label={t("pespo_reports.client.previous_month")}
            onClick={() => setMonth(format(addMonths(monthDate, -1), "yyyy-MM"))}
            className="grid size-7 place-items-center text-tertiary hover:text-primary"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-36 text-center text-body-xs-medium text-primary">
            {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
          </span>
          <button
            type="button"
            aria-label={t("pespo_reports.client.next_month")}
            disabled={isCurrentMonth}
            onClick={() => setMonth(format(addMonths(monthDate, 1), "yyyy-MM"))}
            className="grid size-7 place-items-center text-tertiary hover:text-primary disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <label
          className="flex items-center gap-2 text-body-xs-regular text-secondary"
          title={data && !data.hours.client_visible ? t("pespo_reports.client.include_hours_hint") : undefined}
        >
          <ToggleSwitch value={showHours} onChange={() => setIncludeHours(!showHours)} size="sm" />
          {t("pespo_reports.client.include_hours")}
        </label>
        <Button
          variant="secondary"
          className="ml-auto"
          disabled={!data}
          onClick={() => {
            const element = document.getElementById("pespo-report");
            if (element && data)
              printReport(
                element,
                t("pespo_reports.client.title", { client: data.client_name || data.project.name, month: monthLabel })
              );
          }}
        >
          <Printer className="size-3.5" />
          {t("pespo_reports.client.print")}
        </Button>
      </div>

      {error ? (
        <p className="text-body-sm-regular text-danger-primary">{t("pespo_reports.client.error")}</p>
      ) : isLoading && !data ? (
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="96px" />
          <Loader.Item height="200px" />
        </Loader>
      ) : data ? (
        <div id="pespo-report" className={cn("flex flex-col gap-6", { "opacity-60": isLoading })}>
          <header className="flex flex-col gap-1">
            <h2 className="text-h4-medium text-primary">
              {t("pespo_reports.client.title", { client: data.client_name || data.project.name, month: monthLabel })}
            </h2>
            <p className="text-body-sm-regular text-tertiary">
              {data.contract
                ? data.contract.end_date
                  ? t("pespo_reports.client.contract", {
                      type: data.contract.type,
                      start: renderFormattedDate(data.contract.start_date),
                      end: renderFormattedDate(data.contract.end_date),
                    })
                  : t("pespo_reports.client.contract_open", {
                      type: data.contract.type,
                      start: renderFormattedDate(data.contract.start_date),
                    })
                : data.contract_status === "unavailable"
                  ? t("pespo_reports.client.portal_unavailable")
                  : t("pespo_reports.client.no_contract")}
            </p>
          </header>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label={t("pespo_reports.client.delivered")} value={String(data.pieces.delivered_total)} />
            <Tile
              label={t("pespo_reports.client.on_time")}
              value={t("pespo_reports.client.on_time_value", {
                done: data.pieces.on_time,
                total: data.pieces.with_due_date,
              })}
            />
            <Tile label={t("pespo_reports.client.requested")} value={String(data.pieces.requested_total)} />
            <Tile
              label={t("pespo_reports.client.reworks")}
              value={String(data.reworks.total)}
              detail={t("pespo_reports.client.reworks_detail", data.reworks)}
            />
            <Tile label={t("pespo_reports.client.meetings")} value={String(data.meetings.items.length)} />
            {showHours && (
              <Tile label={t("pespo_reports.client.hours")} value={formatDuration(data.hours.total_seconds)} />
            )}
          </div>

          <Section title={t("pespo_reports.client.deliveries")}>
            {data.pieces.delivered_items.length === 0 ? (
              <p className="text-body-sm-regular text-tertiary">{t("pespo_reports.client.no_deliveries")}</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-subtle">
                <table className="w-full text-body-xs-regular">
                  <thead className="bg-layer-1 text-tertiary">
                    <tr>
                      <th className={cellClass}>{t("pespo_reports.client.piece")}</th>
                      <th className={cellClass}>{t("pespo_reports.client.category")}</th>
                      <th className={cellClass}>{t("pespo_reports.client.delivered_at")}</th>
                      <th className={cellClass}>{t("pespo_reports.client.due")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {data.pieces.delivered_items.map((item) => (
                      <tr key={item.id}>
                        <td className={cellClass}>
                          <a
                            href={`/${slug}/browse/${label(data.project.identifier, item.sequence_id)}/`}
                            className="text-primary hover:underline"
                          >
                            {item.name}
                          </a>
                          <span className="ml-1.5 text-tertiary">
                            {label(data.project.identifier, item.sequence_id)}
                          </span>
                        </td>
                        <td className={cellClass}>{item.category}</td>
                        <td className={cellClass}>{renderFormattedDate(item.completed_at)}</td>
                        <td className={cellClass}>
                          {item.target_date ? (
                            <span className="flex items-center gap-1">
                              {renderFormattedDate(item.target_date)}
                              {item.on_time ? (
                                <span className="flex items-center gap-0.5 text-success-primary">
                                  <CheckCircle2 className="size-3" />
                                  {t("pespo_reports.client.in_time")}
                                </span>
                              ) : (
                                <span className="flex items-center gap-0.5 text-danger-primary">
                                  <AlertTriangle className="size-3" />
                                  {t("pespo_reports.client.late")}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-placeholder">–</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title={t("pespo_reports.client.by_category")}>
              <div className="overflow-hidden rounded-lg border border-subtle">
                <table className="w-full text-body-xs-regular">
                  <thead className="bg-layer-1 text-tertiary">
                    <tr>
                      <th className={cellClass}>{t("pespo_reports.client.category")}</th>
                      <th className={cellClass}>{t("pespo_reports.client.requested")}</th>
                      <th className={cellClass}>{t("pespo_reports.client.delivered")}</th>
                      {data.balance.length > 0 && <th className={cellClass}>{t("pespo_reports.client.balance")}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {data.pieces.requested.map((row, index) => {
                      const balance = data.balance.find((b) => b.category === row.category);
                      return (
                        <tr key={row.category}>
                          <td className={cellClass}>{row.category}</td>
                          <td className={cn(cellClass, "tabular-nums")}>{row.count}</td>
                          <td className={cn(cellClass, "tabular-nums")}>{data.pieces.delivered[index]?.count ?? 0}</td>
                          {data.balance.length > 0 && (
                            <td className={cn(cellClass, "tabular-nums")}>
                              {balance
                                ? t("pespo_reports.client.balance_value", {
                                    available: balance.available,
                                    contracted: balance.contracted,
                                  })
                                : "–"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
            <Section title={t("pespo_reports.client.in_progress")}>
              <div className="grid grid-cols-3 gap-3">
                <Tile label={t("pespo_reports.client.state_started")} value={String(data.pieces.open_now.started)} />
                <Tile
                  label={t("pespo_reports.client.state_unstarted")}
                  value={String(data.pieces.open_now.unstarted)}
                />
                <Tile label={t("pespo_reports.client.state_backlog")} value={String(data.pieces.open_now.backlog)} />
              </div>
            </Section>
          </div>

          <Section title={t("pespo_reports.client.approvals")}>
            {data.approvals.items.length === 0 ? (
              <p className="text-body-sm-regular text-tertiary">{t("pespo_reports.client.no_approvals")}</p>
            ) : (
              <>
                <p className="text-body-xs-regular text-tertiary">
                  {t("pespo_reports.client.approvals_summary", {
                    total: data.approvals.total,
                    client: data.approvals.by_client,
                  })}
                </p>
                <ul className="flex flex-col gap-1 text-body-xs-regular">
                  {data.approvals.items.map((approval) => (
                    <li key={approval.id} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-tertiary">{renderFormattedDate(approval.approved_at)}</span>
                      <a
                        href={`/${slug}/browse/${label(data.project.identifier, approval.sequence_id)}/`}
                        className="truncate text-primary hover:underline"
                      >
                        {approval.name}
                      </a>
                      <span className="shrink-0 text-tertiary">
                        {label(data.project.identifier, approval.sequence_id)}
                      </span>
                      {approval.role && (
                        <span className="shrink-0 rounded-sm bg-layer-1 px-1.5 text-caption-sm-regular text-secondary">
                          {approval.on_behalf
                            ? t("pespo_reports.client.approved_on_behalf", { channel: approval.channel })
                            : approval.role === "client"
                              ? t("pespo_reports.client.approved_by_client")
                              : t("pespo_reports.client.approved_by_team")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          <Section title={t("pespo_reports.client.meetings_list")}>
            {data.meetings.items.length === 0 ? (
              <p className="text-body-sm-regular text-tertiary">{t("pespo_reports.client.no_meetings")}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-body-xs-regular">
                {data.meetings.items.map((meeting) => (
                  <li key={meeting.id} className="flex gap-3">
                    <span className="w-24 shrink-0 text-tertiary">{renderFormattedDate(meeting.start)}</span>
                    <span className="text-primary">{meeting.summary}</span>
                    <span className="text-tertiary">{label(data.project.identifier, meeting.issue_sequence_id)}</span>
                  </li>
                ))}
              </ul>
            )}
            {data.meetings.minutes.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                <h4 className="text-body-xs-medium text-tertiary">{t("pespo_reports.client.minutes")}</h4>
                {data.meetings.minutes.map((minute) => (
                  <article
                    key={minute.id}
                    className={cn("rounded-md border border-subtle px-3 py-2", {
                      "pespo-no-print": !minute.client_visible,
                    })}
                  >
                    <div className="flex items-center gap-2 text-body-xs-medium text-primary">
                      {minute.title}
                      <span className="text-caption-sm-regular text-tertiary">
                        {renderFormattedDate(minute.started_at)}
                      </span>
                      {!minute.client_visible && (
                        <span className="rounded-sm bg-layer-1 px-1.5 text-caption-sm-regular text-secondary">
                          {t("pespo_reports.client.team_only")}
                        </span>
                      )}
                    </div>
                    {minute.resumo && <p className="mt-1 text-body-xs-regular text-secondary">{minute.resumo}</p>}
                  </article>
                ))}
                <p className="pespo-no-print text-caption-sm-regular text-placeholder">
                  {t("pespo_reports.client.print_hint")}
                </p>
              </div>
            )}
          </Section>

          {showHours && data.hours.total_seconds > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Section title={t("pespo_reports.client.hours_by_person")}>
                <ul className="flex flex-col gap-1 text-body-xs-regular">
                  {data.hours.by_user.map((row) => (
                    <li key={row.id} className="flex justify-between gap-3">
                      <span className="text-primary">{row.display_name}</span>
                      <span className="text-primary tabular-nums">{formatDuration(row.seconds)}</span>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title={t("pespo_reports.client.hours_by_item")}>
                <ul className="flex flex-col gap-1 text-body-xs-regular">
                  {data.hours.top_items.map((row) => (
                    <li key={row.id} className="flex justify-between gap-3">
                      <span className="truncate text-primary">
                        {row.name}
                        <span className="ml-1.5 text-tertiary">{label(data.project.identifier, row.sequence_id)}</span>
                      </span>
                      <span className="shrink-0 text-primary tabular-nums">{formatDuration(row.seconds)}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
          )}

          <footer className="text-caption-sm-regular text-placeholder">
            {t("pespo_reports.client.generated", { date: renderFormattedDate(data.generated_at) })}
          </footer>
        </div>
      ) : null}
    </div>
  );
});
