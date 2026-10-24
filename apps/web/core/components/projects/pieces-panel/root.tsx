/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { AlertTriangle, CalendarClock, Info, Plus, RotateCcw } from "lucide-react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TProjectPiecesPanel } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// services
import { projectPiecesService } from "@/services/project-pieces.service";
// local imports
import { formatDay, getPiecesPanelKey } from "./helpers";
import { PiecesRequestModal } from "./request-modal";

type Props = { workspaceSlug: string; projectId: string };

function StatTile(props: { label: string; value: number | string; hint?: string }) {
  const { label, value, hint } = props;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-subtle bg-layer-1 p-4">
      <span className="text-body-xs-medium text-secondary">{label}</span>
      <span className="text-h3-semibold text-primary tabular-nums">{value}</span>
      {hint && <span className="text-caption-sm-regular text-tertiary">{hint}</span>}
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-lg border border-subtle bg-layer-1 p-4", props.className)}>
      <h3 className="text-body-sm-medium text-primary">{props.title}</h3>
      {props.children}
    </section>
  );
}

/** Usadas / contratadas de uma categoria: barra fina de uma cor só, com o número escrito ao lado. */
function BalanceRow(props: { category: string; contracted: number; used: number; available: number }) {
  const { category, contracted, used, available } = props;
  const { t } = useTranslation();
  const over = available < 0;
  const ratio = contracted > 0 ? Math.min(used / contracted, 1) : used > 0 ? 1 : 0;
  return (
    <div className="flex flex-col gap-1.5" title={t("pieces_panel.balance.tooltip", { used, contracted })}>
      <div className="flex items-baseline justify-between gap-2 text-body-xs-regular">
        <span className="text-body-xs-medium text-primary">{category}</span>
        <span className="text-secondary tabular-nums">{t("pieces_panel.balance.used_of", { used, contracted })}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-layer-3">
        <div
          className={cn("h-full rounded-full", over ? "bg-danger-primary" : "bg-accent-primary")}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span
        className={cn(
          "flex items-center gap-1 text-caption-sm-regular",
          over ? "text-danger-primary" : "text-tertiary"
        )}
      >
        {over && <AlertTriangle className="size-3" />}
        {over
          ? t("pieces_panel.balance.over", { count: -available })
          : t("pieces_panel.balance.available", { count: available })}
      </span>
    </div>
  );
}

function PieceLink(props: { workspaceSlug: string; projectId: string; id: string; name: string; extra?: string }) {
  const { setPeekIssue } = useIssueDetail();
  return (
    <button
      type="button"
      onClick={() =>
        setPeekIssue({ workspaceSlug: props.workspaceSlug, projectId: props.projectId, issueId: props.id })
      }
      className="flex w-full items-center justify-between gap-2 rounded-sm px-1 py-1 text-left text-body-xs-regular hover:bg-layer-1-hover"
    >
      <span className="truncate text-primary">{props.name}</span>
      {props.extra && <span className="flex-shrink-0 text-tertiary tabular-nums">{props.extra}</span>}
    </button>
  );
}

/** Pespo: painel de peças do projeto de um cliente — quantidade de peças, saldo do contrato, refações,
 * entregas do mês e "Solicitar peças". Substitui o dashboard do Metabase. */
export const ProjectPiecesPanel = observer(function ProjectPiecesPanel(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t, currentLocale } = useTranslation();
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const { data, isLoading, mutate } = useSWR<TProjectPiecesPanel>(
    workspaceSlug && projectId ? getPiecesPanelKey(workspaceSlug, projectId) : null,
    () => projectPiecesService.panel(workspaceSlug, projectId)
  );

  if (isLoading || !data)
    return (
      <Loader className="grid grid-cols-1 gap-4 p-6 md:grid-cols-4">
        <Loader.Item height="96px" />
        <Loader.Item height="96px" />
        <Loader.Item height="96px" />
        <Loader.Item height="96px" />
      </Loader>
    );

  const groups = Object.fromEntries(data.by_state_group.map((row) => [row.group, row.count]));
  const maxGroup = Math.max(1, ...data.by_state_group.map((row) => row.count));
  const canRequest = data.contract_status === "ok" && !!data.contract;
  const monthName = new Date().toLocaleDateString(currentLocale, { month: "long" });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-h4-semibold text-primary">{data.client_name ?? t("pieces_panel.title")}</h2>
          {data.contract && (
            <p className="text-body-xs-regular text-tertiary">
              {t("pieces_panel.contract_line", {
                type: data.contract.type,
                start: formatDay(data.contract.start_date, currentLocale),
                end: formatDay(data.contract.end_date, currentLocale),
              })}
            </p>
          )}
        </div>
        {canRequest && (
          <Button variant="primary" size="lg" onClick={() => setIsRequestOpen(true)}>
            <Plus className="size-4" />
            {t("pieces_panel.request.open")}
          </Button>
        )}
      </div>

      {data.expiring && (
        <div className="flex items-center gap-2 rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2 text-body-xs-medium text-warning-primary">
          <CalendarClock className="size-4 flex-shrink-0" />
          {data.expiring.days_left < 0
            ? t("pieces_panel.expired", { date: formatDay(data.expiring.end_date, currentLocale) })
            : t("pieces_panel.expiring", { count: data.expiring.days_left })}
        </div>
      )}
      {data.contract_status !== "ok" && (
        <div className="flex items-center gap-2 rounded-md border border-subtle bg-layer-1 px-3 py-2 text-body-xs-regular text-secondary">
          <Info className="size-4 flex-shrink-0 text-tertiary" />
          {t(`pieces_panel.status.${data.contract_status}`)}
        </div>
      )}
      {data.contract_status === "ok" && !data.contract && (
        <div className="flex items-center gap-2 rounded-md border border-subtle bg-layer-1 px-3 py-2 text-body-xs-regular text-secondary">
          <Info className="size-4 flex-shrink-0 text-tertiary" />
          {t("pieces_panel.status.no_contract")}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t("pieces_panel.stats.total")} value={data.total_pieces} />
        <StatTile label={t("pieces_panel.stats.in_production")} value={groups.started ?? 0} />
        <StatTile
          label={t("pieces_panel.stats.delivered_month", { month: monthName })}
          value={data.delivered_this_month.length}
        />
        <StatTile
          label={t("pieces_panel.stats.reworks")}
          value={data.reworks.total}
          hint={t("pieces_panel.stats.reworks_split", { internal: data.reworks.internal, client: data.reworks.client })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title={t("pieces_panel.balance.title")}>
          {data.availability.categories.length === 0 ? (
            <p className="text-body-xs-regular text-tertiary">{t("pieces_panel.balance.empty")}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {data.availability.categories.map((row) => (
                <BalanceRow key={row.category} {...row} />
              ))}
              <p className="border-t border-subtle pt-3 text-body-xs-regular text-secondary">
                {t("pieces_panel.balance.urgent", {
                  count: Math.max(0, data.availability.urgent.available),
                  limit: data.availability.urgent.limit,
                  open: data.availability.urgent.open_now,
                  max: data.availability.urgent.max_simultaneous,
                })}
              </p>
            </div>
          )}
        </Section>

        <Section title={t("pieces_panel.by_state.title")}>
          <div className="flex flex-col gap-2.5">
            {data.by_state_group.map((row) => (
              <div key={row.group} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 text-body-xs-regular">
                <span className="text-secondary">{t(`pieces_panel.by_state.${row.group}`)}</span>
                <div className="h-2 overflow-hidden rounded-full bg-layer-3" title={`${row.count}`}>
                  <div
                    className="h-full rounded-full bg-accent-primary"
                    style={{ width: `${(row.count / maxGroup) * 100}%` }}
                  />
                </div>
                <span className="text-right text-primary tabular-nums">{row.count}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title={t("pieces_panel.reworks.title")}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-body-xs-medium text-secondary">
                <RotateCcw className="size-3.5" />
                {t("pieces_panel.reworks.now", { count: data.reworks.in_rework_now.length })}
              </span>
              {data.reworks.in_rework_now.map((piece) => (
                <PieceLink
                  key={piece.id}
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  id={piece.id}
                  name={piece.name}
                  extra={piece.state}
                />
              ))}
            </div>
            {data.reworks.most_reworked.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-subtle pt-3">
                <span className="text-body-xs-medium text-secondary">{t("pieces_panel.reworks.most")}</span>
                {data.reworks.most_reworked.map((piece) => (
                  <PieceLink
                    key={piece.id}
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                    id={piece.id}
                    name={piece.name}
                    extra={t("pieces_panel.reworks.times", { count: piece.count })}
                  />
                ))}
              </div>
            )}
          </div>
        </Section>

        <Section title={t("pieces_panel.delivered.title", { month: monthName })}>
          {data.delivered_this_month.length === 0 ? (
            <p className="text-body-xs-regular text-tertiary">{t("pieces_panel.delivered.empty")}</p>
          ) : (
            <div className="flex flex-col">
              {data.delivered_this_month.map((piece) => (
                <PieceLink
                  key={piece.id}
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  id={piece.id}
                  name={`${piece.category} · ${piece.name}`}
                  extra={new Date(piece.completed_at).toLocaleDateString(currentLocale, {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      {canRequest && (
        <PiecesRequestModal
          isOpen={isRequestOpen}
          onClose={() => setIsRequestOpen(false)}
          onRequested={() => void mutate()}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          panel={data}
        />
      )}
    </div>
  );
});
