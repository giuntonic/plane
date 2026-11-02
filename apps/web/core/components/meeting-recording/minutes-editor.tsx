/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: a ata da reunião. A equipe escreve (ou revisa o rascunho automático), transforma próximos passos em
// subtarefas e publica no item, só para a equipe ou também para o cliente.
import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { CheckCircle2, Plus, Sparkles, X } from "lucide-react";
import { useSWRConfig } from "swr";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TMeetingNextStep, TMeetingRecordingDetail, TMeetingSummary } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { cn, renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { getCardExtrasKey } from "@/components/issues/card-extras";
import { getIssueChecklistKey } from "@/components/issues/issue-detail-widgets/checklist/helper";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// services
import { meetingRecordingService } from "@/services/meeting-recording.service";
// local imports
import { getMeetingRecordingKey, getMeetingRecordingsKey } from "./keys";

type TRef = { workspaceSlug: string; projectId: string; issueId: string };
type TListField = "pauta" | "decisoes" | "pendencias";

const textareaClass =
  "w-full resize-y rounded-md border border-subtle bg-transparent px-3 py-2 text-body-sm-regular text-primary placeholder:text-placeholder focus:border-accent-strong focus:outline-none";
const inputClass =
  "min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1.5 py-1 text-body-sm-regular text-primary placeholder:text-placeholder hover:border-subtle focus:border-accent-strong focus:outline-none";

function ListEditor(props: { label: string; items: string[]; onChange: (items: string[]) => void }) {
  const { label, items, onChange } = props;
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    onChange([...items, draft.trim()]);
    setDraft("");
  };
  return (
    <section className="flex flex-col gap-1">
      <h4 className="text-body-xs-medium text-tertiary">{label}</h4>
      <ul className="flex flex-col">
        {items.map((item, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- linhas de texto livre, sem id
          <li key={index} className="group flex items-center gap-1">
            <span className="size-1 shrink-0 rounded-full bg-layer-3" />
            <input
              className={inputClass}
              value={item}
              onChange={(event) => onChange(items.map((current, i) => (i === index ? event.target.value : current)))}
            />
            <button
              type="button"
              aria-label={t("meeting_recording.minutes.remove")}
              onClick={() => onChange(items.filter((_item, i) => i !== index))}
              className="grid size-6 shrink-0 place-items-center rounded-sm text-tertiary opacity-0 group-hover:opacity-100 hover:text-primary focus:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1">
        <Plus className="size-3.5 shrink-0 text-placeholder" />
        <input
          className={inputClass}
          value={draft}
          placeholder={t("meeting_recording.minutes.item_placeholder")}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={add}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
      </div>
    </section>
  );
}

type Props = { reference: TRef; recording: TMeetingRecordingDetail };

export const MeetingMinutesEditor = observer(function MeetingMinutesEditor({ reference, recording }: Props) {
  const { t } = useTranslation();
  const { mutate } = useSWRConfig();
  const { fetchActivities, fetchComments } = useIssueDetail();
  const [summary, setSummary] = useState<TMeetingSummary>(recording.summary);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [clientVisible, setClientVisible] = useState(recording.client_visible);
  const [busy, setBusy] = useState<"save" | "subtasks" | "publish" | null>(null);
  const [newStep, setNewStep] = useState("");

  // um rascunho novo do servidor (ex.: o resumo automático terminou) entra se não há edição pendente
  useEffect(() => {
    if (!dirty) setSummary(recording.summary);
    // oxlint-disable-next-line hooks/exhaustive-deps -- só quando a ata do servidor muda
  }, [recording.summary]);

  const change = (patch: Partial<TMeetingSummary>) => {
    setSummary((current) => ({ ...current, ...patch }));
    setDirty(true);
  };
  const changeStep = (index: number, patch: Partial<TMeetingNextStep>) =>
    change({ proximos_passos: summary.proximos_passos.map((s, i) => (i === index ? { ...s, ...patch } : s)) });

  const refresh = (detail: TMeetingRecordingDetail) => {
    void mutate(getMeetingRecordingKey(recording.id), { ...detail, received_at: Date.now() }, { revalidate: false });
    void mutate(getMeetingRecordingsKey(reference.issueId));
  };

  const save = async () => {
    const detail = await meetingRecordingService.update(reference, recording.id, { summary });
    setDirty(false);
    setSummary(detail.summary);
    refresh(detail);
    return detail;
  };

  const run = async (kind: "save" | "subtasks" | "publish", action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
    } catch (error) {
      const code = (error as { error?: string })?.error;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(code === "EMPTY_SUMMARY" ? "meeting_recording.minutes.empty_error" : "meeting_recording.error"),
      });
    } finally {
      setBusy(null);
    }
  };

  const createSubtasks = () =>
    run("subtasks", async () => {
      if (dirty) await save();
      const detail = await meetingRecordingService.createSubtasks(reference, recording.id, selected);
      setSelected([]);
      setSummary(detail.summary);
      refresh(detail);
      void mutate(getIssueChecklistKey(reference.issueId));
      void mutate(getCardExtrasKey(reference.projectId));
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("meeting_recording.minutes.subtasks_created", { count: detail.created }),
      });
    });

  const publish = () =>
    run("publish", async () => {
      if (dirty) await save();
      const detail = await meetingRecordingService.publish(reference, recording.id, clientVisible);
      refresh(detail);
      void fetchComments(reference.workspaceSlug, reference.projectId, reference.issueId);
      void fetchActivities(reference.workspaceSlug, reference.projectId, reference.issueId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("meeting_recording.minutes.published") });
    });

  const addStep = () => {
    if (!newStep.trim()) return;
    change({
      proximos_passos: [
        ...summary.proximos_passos,
        { tarefa: newStep.trim(), responsavel_id: null, responsavel: null, prazo: null, subtask_id: null },
      ],
    });
    setNewStep("");
  };

  return (
    <div className="flex flex-col">
      <div className="vertical-scrollbar scrollbar-sm flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-5 py-4">
        {recording.summary_source === "ollama" && recording.summary_status === "draft" && (
          <p className="flex items-center gap-2 rounded-md bg-layer-1 px-3 py-2 text-body-xs-regular text-secondary">
            <Sparkles className="size-3.5 shrink-0 text-accent-primary" />
            {t("meeting_recording.minutes.auto_draft")}
          </p>
        )}
        <section className="flex flex-col gap-1">
          <h4 className="text-body-xs-medium text-tertiary">{t("meeting_recording.minutes.summary")}</h4>
          <textarea
            className={textareaClass}
            rows={3}
            value={summary.resumo}
            placeholder={t("meeting_recording.minutes.summary_placeholder")}
            onChange={(event) => change({ resumo: event.target.value })}
          />
        </section>
        {(
          [
            ["pauta", "agenda"],
            ["decisoes", "decisions"],
          ] as [TListField, string][]
        ).map(([field, label]) => (
          <ListEditor
            key={field}
            label={t(`meeting_recording.minutes.${label}`)}
            items={summary[field]}
            onChange={(items) => change({ [field]: items })}
          />
        ))}
        <section className="flex flex-col gap-1">
          <h4 className="text-body-xs-medium text-tertiary">{t("meeting_recording.minutes.next_steps")}</h4>
          <ul className="flex flex-col">
            {summary.proximos_passos.map((step, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- a posição é o id que o servidor usa
              <li key={index} className="group flex items-center gap-1.5">
                {step.subtask_id ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success-primary" />
                ) : (
                  <input
                    type="checkbox"
                    className="size-3.5 shrink-0 accent-[var(--color-accent-primary)]"
                    checked={selected.includes(index)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked ? [...current, index] : current.filter((i) => i !== index)
                      )
                    }
                  />
                )}
                <input
                  className={inputClass}
                  value={step.tarefa}
                  onChange={(event) => changeStep(index, { tarefa: event.target.value })}
                />
                {step.subtask_id && (
                  <span className="shrink-0 text-caption-sm-regular text-success-primary">
                    {t("meeting_recording.minutes.subtask_created")}
                  </span>
                )}
                <MemberDropdown
                  projectId={reference.projectId}
                  value={step.responsavel_id}
                  onChange={(member) => changeStep(index, { responsavel_id: member, responsavel: null })}
                  multiple={false}
                  buttonVariant={step.responsavel_id ? "transparent-with-text" : "transparent-without-text"}
                  placeholder={step.responsavel || t("meeting_recording.minutes.no_assignee")}
                  showTooltip
                />
                <DateDropdown
                  value={step.prazo}
                  onChange={(date) => changeStep(index, { prazo: renderFormattedPayloadDate(date) ?? null })}
                  buttonVariant={step.prazo ? "transparent-with-text" : "transparent-without-text"}
                  placeholder={t("meeting_recording.minutes.due")}
                  isClearable
                  showTooltip
                />
                <button
                  type="button"
                  aria-label={t("meeting_recording.minutes.remove")}
                  onClick={() => {
                    setSelected([]);
                    change({ proximos_passos: summary.proximos_passos.filter((_s, i) => i !== index) });
                  }}
                  className="grid size-6 shrink-0 place-items-center rounded-sm text-tertiary opacity-0 group-hover:opacity-100 hover:text-primary focus:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1">
            <Plus className="size-3.5 shrink-0 text-placeholder" />
            <input
              className={inputClass}
              value={newStep}
              placeholder={t("meeting_recording.minutes.task_placeholder")}
              onChange={(event) => setNewStep(event.target.value)}
              onBlur={addStep}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addStep();
                }
              }}
            />
          </div>
        </section>
        <ListEditor
          label={t("meeting_recording.minutes.open_points")}
          items={summary.pendencias}
          onChange={(items) => change({ pendencias: items })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-subtle px-5 py-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={!dirty || !!busy}
          loading={busy === "save"}
          onClick={() => void run("save", async () => void (await save()))}
        >
          {busy === "save"
            ? t("meeting_recording.minutes.saving")
            : dirty
              ? t("meeting_recording.minutes.save")
              : t("meeting_recording.minutes.saved")}
        </Button>
        {selected.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            disabled={!!busy}
            loading={busy === "subtasks"}
            onClick={() => void createSubtasks()}
          >
            {t("meeting_recording.minutes.create_subtasks", { count: selected.length })}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-3">
          {recording.published_at && (
            <span className="hidden text-caption-sm-regular text-tertiary sm:inline">
              {t("meeting_recording.minutes.published_at", { date: renderFormattedDate(recording.published_at) })}
            </span>
          )}
          <label
            className="flex items-center gap-2 text-body-xs-regular text-secondary"
            title={t("meeting_recording.minutes.client_visible_hint")}
          >
            <ToggleSwitch value={clientVisible} onChange={() => setClientVisible((value) => !value)} size="sm" />
            {t("meeting_recording.minutes.client_visible")}
          </label>
          <Button
            variant="primary"
            size="sm"
            disabled={!!busy}
            loading={busy === "publish"}
            onClick={() => void publish()}
            className={cn({ "opacity-90": recording.summary_status === "published" && !dirty })}
          >
            {recording.summary_status === "published"
              ? t("meeting_recording.minutes.update_publication")
              : t("meeting_recording.minutes.publish")}
          </Button>
        </div>
      </div>
    </div>
  );
});
