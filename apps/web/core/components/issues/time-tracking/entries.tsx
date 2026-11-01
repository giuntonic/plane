/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueTimeEntry } from "@plane/types";
import { Avatar, Button, Collapsible, CollapsibleButton, Input } from "@plane/ui";
import { cn, getFileURL, renderFormattedDate } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
// local imports
import { formatDuration, parseDuration } from "./helpers";
import { useLiveTotal, useTimeTrackingAccess } from "./property";
import { useIssueTimeEntries, useTimeTrackingActions } from "./use-time-tracking";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
};

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const localDay = (iso: string) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

function EntryForm(props: {
  initial?: { duration: string; date: string; note: string };
  submitLabel: string;
  onSubmit: (values: { duration_seconds: number; date: string; note: string }) => Promise<void>;
  onCancel?: () => void;
}) {
  const { initial, submitLabel, onSubmit, onCancel } = props;
  const { t } = useTranslation();
  const [duration, setDuration] = useState(initial?.duration ?? "");
  const [date, setDate] = useState(initial?.date ?? today());
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const seconds = parseDuration(duration);

  const submit = async () => {
    if (!seconds) return;
    setSaving(true);
    try {
      await onSubmit({ duration_seconds: seconds, date, note: note.trim() });
      if (!initial) {
        setDuration("");
        setNote("");
      }
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("time_tracking.error") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Input
        value={duration}
        onChange={(event) => setDuration(event.target.value)}
        placeholder={t("time_tracking.duration_placeholder")}
        aria-label={t("time_tracking.duration")}
        hasError={!!duration && !seconds}
        className="w-24 text-13"
      />
      <Input
        type="date"
        value={date}
        max={today()}
        onChange={(event) => setDate(event.target.value)}
        aria-label={t("time_tracking.date")}
        className="w-36 text-13"
      />
      <Input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t("time_tracking.note_placeholder")}
        aria-label={t("time_tracking.note")}
        className="min-w-32 flex-1 text-13"
      />
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="neutral-primary" size="sm" type="button" onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
        <Button variant="primary" size="sm" type="submit" loading={saving} disabled={!seconds || saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

const EntryRow = observer(function EntryRow(props: {
  entry: TIssueTimeEntry;
  canChange: boolean;
  onUpdate: (values: { duration_seconds: number; date: string; note: string }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { entry, canChange, onUpdate, onDelete } = props;
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  const [editing, setEditing] = useState(false);
  const user = getUserDetails(entry.user);

  if (editing)
    return (
      <div className="rounded-md border border-subtle p-2">
        <EntryForm
          initial={{
            duration: formatDuration(entry.duration_seconds).replace(" ", ""),
            date: localDay(entry.started_at),
            note: entry.note,
          }}
          submitLabel={t("save")}
          onSubmit={async (values) => {
            await onUpdate(values);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );

  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-layer-1">
      <Avatar
        name={user?.display_name ?? entry.user_display_name}
        src={getFileURL(user?.avatar_url ?? "")}
        size="sm"
        showTooltip={false}
      />
      <span className="w-28 shrink-0 truncate text-13 text-primary">
        {user?.display_name ?? entry.user_display_name}
      </span>
      <span className="w-16 shrink-0 text-12 text-tertiary">{renderFormattedDate(entry.started_at, "dd/MM")}</span>
      <span
        className={cn(
          "w-20 shrink-0 text-13 font-medium tabular-nums",
          entry.is_running ? "text-danger-primary" : "text-primary"
        )}
      >
        {entry.is_running ? t("time_tracking.running") : formatDuration(entry.duration_seconds)}
      </span>
      <span className="min-w-0 flex-1 truncate text-12 text-secondary">
        {entry.note}
        {entry.source === "auto_stopped" && (
          <Tooltip tooltipContent={t("time_tracking.auto_stopped_hint")} position="top">
            <span className="ml-1 rounded-sm bg-warning-subtle px-1 text-11 text-warning-primary">
              {t("time_tracking.auto_stopped")}
            </span>
          </Tooltip>
        )}
      </span>
      {canChange && !entry.is_running && (
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            aria-label={t("edit")}
            onClick={() => setEditing(true)}
            className="grid size-6 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={t("delete")}
            onClick={() => void onDelete()}
            className="grid size-6 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-danger-primary"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
});

/** Seção "Tempo gasto" do item: o total por pessoa, os lançamentos e o lançamento manual (só a equipe). */
export const TimeTrackingCollapsible = observer(function TimeTrackingCollapsible(props: Props) {
  const { workspaceSlug, projectId, issueId } = props;
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { openWidgets, toggleOpenWidget } = useIssueDetail();
  const { isTeam, isAdmin } = useTimeTrackingAccess(workspaceSlug, projectId);
  const { data } = useIssueTimeEntries(workspaceSlug, projectId, issueId, isTeam);
  const actions = useTimeTrackingActions(workspaceSlug);
  const total = useLiveTotal(data);

  if (!isTeam) return null;
  const isOpen = openWidgets.includes("time-tracking");
  const entries = data?.entries ?? [];

  const byPerson = new Map<string, { name: string; seconds: number }>();
  for (const entry of entries) {
    const current = byPerson.get(entry.user) ?? { name: entry.user_display_name, seconds: 0 };
    current.seconds += entry.duration_seconds;
    byPerson.set(entry.user, current);
  }

  const withToast = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("time_tracking.error") });
    }
  };

  return (
    <Collapsible
      isOpen={isOpen}
      onToggle={() => toggleOpenWidget("time-tracking")}
      title={
        <CollapsibleButton
          isOpen={isOpen}
          title={t("time_tracking.title")}
          indicatorElement={
            total ? <span className="text-13 text-tertiary tabular-nums">{formatDuration(total)}</span> : undefined
          }
        />
      }
      buttonClassName="w-full"
    >
      <div className="flex flex-col gap-3 px-1.5 pb-2">
        {byPerson.size > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {[...byPerson.values()].map((person) => (
              <span key={person.name} className="rounded-sm bg-layer-1 px-2 py-0.5 text-12 text-secondary">
                {person.name} · <span className="tabular-nums">{formatDuration(person.seconds)}</span>
              </span>
            ))}
          </div>
        )}
        <EntryForm
          submitLabel={t("time_tracking.add")}
          onSubmit={(values) => actions.create(projectId, issueId, values)}
        />
        {entries.length === 0 ? (
          <p className="text-13 text-tertiary">{t("time_tracking.empty")}</p>
        ) : (
          <div className="flex flex-col">
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                canChange={entry.user === currentUser?.id || isAdmin}
                onUpdate={(values) => actions.update(projectId, issueId, entry.id, values)}
                onDelete={() => withToast(() => actions.remove(projectId, issueId, entry.id))}
              />
            ))}
          </div>
        )}
      </div>
    </Collapsible>
  );
});
