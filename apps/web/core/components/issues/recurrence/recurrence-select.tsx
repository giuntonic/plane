/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Repeat } from "lucide-react";
import { observer } from "mobx-react";
import useSWR, { useSWRConfig } from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Popover } from "@plane/propel/popover";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueCardExtras, TIssueRecurrence, TIssueRecurrenceFrequency } from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";
// components
import { getCardExtrasKey } from "@/components/issues/card-extras";
// services
import { issueRecurrenceService } from "@/services/issue-recurrence.service";

const FREQUENCIES: TIssueRecurrenceFrequency[] = ["daily", "weekly", "monthly", "yearly"];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export const getIssueRecurrenceKey = (issueId: string) => `ISSUE_RECURRENCE_${issueId}`;

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  className?: string;
};

/** Pespo: "Repetir" nas propriedades do item — a regra de repetição (estilo ClickUp). */
export const IssueRecurrenceSelect = observer(function IssueRecurrenceSelect(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, className } = props;
  const { t } = useTranslation();
  const { mutate } = useSWRConfig();
  const key = getIssueRecurrenceKey(issueId);
  const { data: recurrence } = useSWR(workspaceSlug && projectId && issueId ? key : null, () =>
    issueRecurrenceService.retrieve(workspaceSlug, projectId, issueId)
  );
  const [isOpen, setIsOpen] = useState(false);
  const [frequency, setFrequency] = useState<TIssueRecurrenceFrequency | "none">("none");
  const [repeatEvery, setRepeatEvery] = useState(1);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [endDate, setEndDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // o formulário abre com a regra salva
  useEffect(() => {
    if (!isOpen) return;
    setFrequency(recurrence?.frequency ?? "none");
    setRepeatEvery(recurrence?.interval ?? 1);
    setWeekdays(recurrence?.weekdays ?? []);
    setEndDate(recurrence?.end_date ?? "");
  }, [isOpen, recurrence]);

  const summarize = (rule: TIssueRecurrence | null | undefined) => {
    if (!rule) return t("issue_recurrence.none");
    const base = t(`issue_recurrence.summary.${rule.frequency}`, { count: rule.interval });
    if (rule.frequency !== "weekly" || rule.weekdays.length === 0) return base;
    return `${base}: ${rule.weekdays.map((day) => t(`issue_recurrence.weekday.${day}`)).join(", ")}`;
  };

  const updateCardFlag = (recurring: boolean) =>
    mutate(
      getCardExtrasKey(projectId),
      (current?: TIssueCardExtras) => {
        if (!current) return current;
        const entry = { ...current[issueId] };
        if (recurring) entry.recurring = true;
        else delete entry.recurring;
        const next = { ...current };
        if (Object.keys(entry).length === 0) delete next[issueId];
        else next[issueId] = entry;
        return next;
      },
      { revalidate: false }
    );

  const handleSave = async (chosen: TIssueRecurrenceFrequency | "none" = frequency) => {
    setIsSaving(true);
    try {
      if (chosen === "none") {
        if (recurrence) await issueRecurrenceService.remove(workspaceSlug, projectId, issueId);
        await mutate(key, null, { revalidate: false });
        await updateCardFlag(false);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("issue_recurrence.stopped") });
      } else {
        const saved = await issueRecurrenceService.save(workspaceSlug, projectId, issueId, {
          frequency: chosen,
          interval: repeatEvery,
          weekdays: chosen === "weekly" ? weekdays : [],
          end_date: endDate || null,
        });
        await mutate(key, saved, { revalidate: false });
        await updateCardFlag(!!saved.next_date);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("issue_recurrence.saved") });
      }
      setIsOpen(false);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("issue_recurrence.error") });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleWeekday = (day: number) =>
    setWeekdays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day]));

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Button
        disabled={disabled}
        className={cn(
          "flex h-7.5 w-full items-center gap-1.5 rounded-sm px-2 text-left text-body-xs-regular",
          recurrence ? "text-primary" : "text-placeholder",
          { "hover:bg-layer-transparent-hover": !disabled, "cursor-not-allowed": disabled },
          className
        )}
      >
        {recurrence && <Repeat className="size-3.5 flex-shrink-0 text-accent-primary" />}
        <span className="truncate">{summarize(recurrence)}</span>
      </Popover.Button>
      <Popover.Panel
        side="bottom"
        align="start"
        positionerClassName="z-50"
        className="flex w-80 flex-col gap-3 rounded-lg border border-subtle bg-surface-1 p-3 shadow-raised-200"
      >
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as TIssueRecurrenceFrequency | "none")}
          aria-label={t("issue_recurrence.label")}
          className="h-8 rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-medium text-primary"
        >
          <option value="none">{t("issue_recurrence.frequency.none")}</option>
          {FREQUENCIES.map((option) => (
            <option key={option} value={option}>
              {t(`issue_recurrence.frequency.${option}`)}
            </option>
          ))}
        </select>

        {frequency !== "none" && (
          <>
            <label className="flex items-center gap-2 text-body-xs-regular text-secondary">
              {t("issue_recurrence.every")}
              <input
                type="number"
                min={1}
                max={365}
                value={repeatEvery}
                onChange={(e) => setRepeatEvery(Math.max(1, Number(e.target.value) || 1))}
                className="h-8 w-16 rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-regular text-primary"
              />
              {t(`issue_recurrence.unit.${frequency}`, { count: repeatEvery })}
            </label>

            {frequency === "weekly" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-body-xs-regular text-secondary">{t("issue_recurrence.on_days")}</span>
                <div className="flex flex-wrap gap-1">
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={weekdays.includes(day)}
                      onClick={() => toggleWeekday(day)}
                      className={cn(
                        "h-7 min-w-9 rounded-md border px-1.5 text-caption-sm-medium",
                        weekdays.includes(day)
                          ? "border-accent-strong bg-accent-subtle text-accent-primary"
                          : "border-subtle text-secondary hover:bg-layer-1"
                      )}
                    >
                      {t(`issue_recurrence.weekday.${day}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="flex items-center justify-between gap-2 text-body-xs-regular text-secondary">
              {t("issue_recurrence.end_date")}
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-regular text-primary"
              />
            </label>

            <p className="text-caption-sm-regular text-tertiary">{t("issue_recurrence.help")}</p>
          </>
        )}

        {recurrence && (
          <p className="text-caption-sm-medium text-secondary">
            {recurrence.next_date
              ? t("issue_recurrence.next", { date: renderFormattedDate(recurrence.next_date) ?? recurrence.next_date })
              : t("issue_recurrence.ended")}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-subtle pt-3">
          {recurrence && frequency !== "none" && (
            <Button variant="secondary" size="base" disabled={isSaving} onClick={() => void handleSave("none")}>
              {t("issue_recurrence.stop")}
            </Button>
          )}
          <Button variant="primary" size="base" loading={isSaving} onClick={() => void handleSave()}>
            {t("issue_recurrence.save")}
          </Button>
        </div>
      </Popover.Panel>
    </Popover>
  );
});
