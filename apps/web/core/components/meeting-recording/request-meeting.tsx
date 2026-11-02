/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: "Solicitar reunião". O cliente escolhe, dentro do item, um horário em que a equipe está livre; o Hub
// marca no Google Calendar de quem atende, com Google Meet, e o convite chega por e-mail.
import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";
import { addDays, format } from "date-fns";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { getIssueMeetingsKey } from "@/components/issues/issue-detail-widgets/meetings/helper";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { meetingRecordingService } from "@/services/meeting-recording.service";

type Props = { workspaceSlug: string; projectId: string; issueId: string; customButton: React.ReactNode };

const DAYS = 7;

/** Só para o cliente (convidado), e só se o projeto liga o "Solicitar reunião". */
export function useCanRequestMeeting(workspaceSlug: string, projectId: string) {
  const { getProjectById } = useProject();
  const { allowPermissions } = useUserPermissions();
  const isGuest =
    allowPermissions([EUserPermissions.GUEST], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId) &&
    !allowPermissions(
      [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
      EUserPermissionsLevel.PROJECT,
      workspaceSlug,
      projectId
    );
  return isGuest && !!getProjectById(projectId)?.meeting_booking?.enabled;
}

export const RequestMeetingButton = observer(function RequestMeetingButton(props: Props) {
  const { workspaceSlug, projectId, issueId, customButton } = props;
  const [isOpen, setIsOpen] = useState(false);
  const canRequest = useCanRequestMeeting(workspaceSlug, projectId);
  if (!canRequest) return null;
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        {customButton}
      </button>
      {isOpen && (
        <RequestMeetingModal
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
});

function RequestMeetingModal(props: Omit<Props, "customButton"> & { onClose: () => void }) {
  const { workspaceSlug, projectId, issueId, onClose } = props;
  const { t } = useTranslation();
  const { mutate } = useSWRConfig();
  const { fetchActivities } = useIssueDetail();
  const reference = { workspaceSlug, projectId, issueId };
  const [from, setFrom] = useState(() => new Date());
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const fromKey = format(from, "yyyy-MM-dd");
  const { data, error, isLoading } = useSWR(
    ["MEETING_SLOTS", issueId, fromKey],
    () => meetingRecordingService.slots(reference, fromKey, DAYS),
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  // horários agrupados por dia, no fuso do navegador (o do cliente)
  const byDay = useMemo(() => {
    const groups = new Map<string, { start: string; label: string }[]>();
    for (const item of data?.slots ?? []) {
      const start = new Date(item.start);
      const key = format(start, "yyyy-MM-dd");
      groups.set(key, [...(groups.get(key) ?? []), { start: item.start, label: format(start, "HH:mm") }]);
    }
    return groups;
  }, [data]);
  const days = Array.from({ length: DAYS }, (_value, index) => addDays(from, index));
  const selectedDay = day && byDay.has(day) ? day : ([...byDay.keys()][0] ?? null);
  const daySlots = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const chosen = slot ? new Date(slot) : null;
  const windowDays = data?.window_days ?? 14;
  const canGoForward = addDays(from, DAYS) <= addDays(new Date(), windowDays);
  const canGoBack = from.toDateString() !== new Date().toDateString();

  const book = async () => {
    if (!slot) return;
    setBusy(true);
    try {
      await meetingRecordingService.requestMeeting(reference, slot, note);
      void mutate(getIssueMeetingsKey(issueId));
      void fetchActivities(workspaceSlug, projectId, issueId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("meeting_booking.booked") });
      onClose();
    } catch (err) {
      const taken = (err as { error?: string })?.error === "SLOT_TAKEN";
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(taken ? "meeting_booking.slot_taken" : "meeting_booking.unavailable"),
      });
      if (taken) {
        setSlot(null);
        void mutate(["MEETING_SLOTS", issueId, fromKey]);
      }
    } finally {
      setBusy(false);
    }
  };

  const move = (delta: number) => {
    setFrom((current) => {
      const next = addDays(current, delta);
      return next < new Date() ? new Date() : next;
    });
    setDay(null);
    setSlot(null);
  };

  return (
    <ModalCore isOpen handleClose={onClose} width={EModalWidth.XXL} preventOutsideClick>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-subtle text-accent-primary">
            <CalendarClock className="size-4" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h3 className="text-h5-medium text-primary">{t("meeting_booking.title")}</h3>
            <p className="text-body-sm-regular text-secondary">{t("meeting_booking.description")}</p>
            {data && (
              <p className="text-body-xs-regular text-tertiary">
                {t("meeting_booking.with", { names: data.hosts.join(", "), minutes: data.duration_minutes })}
              </p>
            )}
          </div>
        </div>

        {error ? (
          <p className="rounded-md bg-danger-subtle px-3 py-2 text-body-sm-regular text-danger-primary">
            {t("meeting_booking.unavailable")}
          </p>
        ) : isLoading && !data ? (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="56px" />
            <Loader.Item height="96px" />
          </Loader>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!canGoBack}
                onClick={() => move(-DAYS)}
                aria-label={t("meeting_booking.previous")}
                className="grid size-7 shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              <div className="grid flex-1 grid-cols-7 gap-1">
                {days.map((date) => {
                  const key = format(date, "yyyy-MM-dd");
                  const count = byDay.get(key)?.length ?? 0;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={count === 0}
                      onClick={() => {
                        setDay(key);
                        setSlot(null);
                      }}
                      className={cn(
                        "flex flex-col items-center rounded-md border py-1.5 text-caption-sm-regular disabled:opacity-40",
                        key === selectedDay
                          ? "border-accent-strong bg-accent-subtle text-primary"
                          : "border-subtle text-secondary hover:bg-layer-transparent-hover"
                      )}
                    >
                      <span className="capitalize">{date.toLocaleDateString(undefined, { weekday: "short" })}</span>
                      <span className="text-body-sm-medium">{format(date, "dd")}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={!canGoForward}
                onClick={() => move(DAYS)}
                aria-label={t("meeting_booking.next")}
                className="grid size-7 shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            {byDay.size === 0 ? (
              <p className="py-4 text-center text-body-sm-regular text-tertiary">{t("meeting_booking.no_slots")}</p>
            ) : (
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                {daySlots.map((item) => (
                  <button
                    key={item.start}
                    type="button"
                    onClick={() => setSlot(item.start)}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-body-xs-medium tabular-nums",
                      slot === item.start
                        ? "border-accent-strong bg-accent-primary text-on-color"
                        : "border-subtle text-primary hover:bg-layer-transparent-hover"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-body-xs-medium text-tertiary">{t("meeting_booking.note")}</span>
              <textarea
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("meeting_booking.note_placeholder")}
                className="w-full resize-none rounded-md border border-subtle bg-transparent px-3 py-2 text-body-sm-regular text-primary placeholder:text-placeholder focus:border-accent-strong focus:outline-none"
              />
            </label>
            <p className="text-caption-sm-regular text-tertiary">{t("meeting_booking.notice")}</p>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-subtle px-5 py-4">
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" disabled={!slot || busy} loading={busy} onClick={() => void book()}>
          {busy
            ? t("meeting_booking.confirming")
            : chosen
              ? t("meeting_booking.confirm", {
                  when: `${chosen.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "2-digit" })} ${format(chosen, "HH:mm")}`,
                })
              : t("meeting_booking.request")}
        </Button>
      </div>
    </ModalCore>
  );
}
