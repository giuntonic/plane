/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { CalendarPlus, Users, Video, X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueServiceType } from "@plane/types";
import { CustomSelect, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
import { renderFormattedPayloadDate } from "@plane/utils";
// components
import { GOOGLE_CALENDAR_STATUS_SWR_KEY } from "@/components/settings/profile/content/pages/google-calendar";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
// services
import { issueCalendarEventService } from "@/services/issue-calendar-event.service";
import userService from "@/services/user.service";
// local imports
import { getGoogleCalendarErrorKey, useIssueMeetings } from "./helper";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueServiceType: TIssueServiceType;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return renderFormattedPayloadDate(date) ?? "";
};

// Pespo: agenda uma reunião no Google Calendar de quem está logado, com Meet e
// convites, já vinculada ao item de trabalho.
export const IssueScheduleMeetingModal = observer(function IssueScheduleMeetingModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, issueId, issueServiceType } = props;
  const { t } = useTranslation();
  const {
    issue: { getIssueById },
    fetchActivities,
  } = useIssueDetail(issueServiceType);
  const { getUserDetails } = useMember();
  const issue = getIssueById(issueId);
  const { mutate } = useIssueMeetings(workspaceSlug, projectId, issueId);
  const { data: status } = useSWR(isOpen ? GOOGLE_CALENDAR_STATUS_SWR_KEY : null, () =>
    userService.googleCalendarStatus()
  );

  const [summary, setSummary] = useState("");
  const [date, setDate] = useState(tomorrow());
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [guests, setGuests] = useState<string[]>([]);
  const [guestInput, setGuestInput] = useState("");
  const [notes, setNotes] = useState("");
  const [withMeet, setWithMeet] = useState(true);
  const [calendarId, setCalendarId] = useState("primary");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSummary(issue?.name ?? "");
    // Default to the due date when it's still ahead, else tomorrow.
    setDate(issue?.target_date && issue.target_date >= tomorrow() ? issue.target_date : tomorrow());
    setAllDay(false);
    setStartTime("10:00");
    setEndTime("11:00");
    setGuests([]);
    setGuestInput("");
    setNotes("");
    setWithMeet(true);
    setCalendarId("primary");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const writableCalendars = useMemo(
    () =>
      status?.connected ? status.calendars.filter((c) => c.access_role === "owner" || c.access_role === "writer") : [],
    [status]
  );
  const assigneeEmails = useMemo(
    () =>
      (issue?.assignee_ids ?? [])
        .map((id) => getUserDetails(id)?.email)
        .filter((email): email is string => !!email && EMAIL_RE.test(email)),
    [issue?.assignee_ids, getUserDetails]
  );

  const addGuest = (raw: string) => {
    const emails = raw
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    const invalid = emails.find((e) => !EMAIL_RE.test(e));
    if (invalid) {
      setError(t("google_calendar_integration.schedule_modal.invalid_email", { email: invalid }));
      return;
    }
    setError(null);
    setGuests((prev) => [...prev, ...emails.filter((e) => !prev.some((p) => p.toLowerCase() === e.toLowerCase()))]);
    setGuestInput("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // An email still in the input (typed but not confirmed with Enter) counts too.
    const pendingGuest = guestInput.trim();
    if (pendingGuest && !EMAIL_RE.test(pendingGuest)) {
      setError(t("google_calendar_integration.schedule_modal.invalid_email", { email: pendingGuest }));
      return;
    }
    const start = allDay ? date : new Date(`${date}T${startTime}`).toISOString();
    const end = allDay ? date : new Date(`${date}T${endTime}`).toISOString();
    if (!allDay && end <= start) {
      setError(t("google_calendar_integration.schedule_modal.end_before_start"));
      return;
    }
    setIsSubmitting(true);
    try {
      await issueCalendarEventService.schedule(workspaceSlug, projectId, issueId, {
        summary: summary.trim() || issue?.name || "",
        description: notes,
        start,
        end,
        all_day: allDay,
        attendees: pendingGuest ? [...guests, pendingGuest] : guests,
        with_meet: withMeet,
        calendar_id: calendarId,
      });
      await mutate();
      void fetchActivities(workspaceSlug, projectId, issueId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("google_calendar_integration.meetings.scheduled") });
      onClose();
    } catch (err) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t(getGoogleCalendarErrorKey(err)) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const calendarLabel =
    writableCalendars.find((c) => (calendarId === "primary" ? c.primary : c.id === calendarId))?.summary ?? calendarId;

  return (
    <ModalCore
      preventOutsideClick
      isOpen={isOpen}
      handleClose={() => !isSubmitting && onClose()}
      width={EModalWidth.XL}
    >
      {status && !status.connected ? (
        <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
          <CalendarPlus className="size-8 text-tertiary" />
          <p className="max-w-sm text-body-sm-regular text-secondary">
            {t("google_calendar_integration.schedule_modal.not_connected")}
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => (window.location.href = "/api/users/me/google-calendar/connect/")}
          >
            {t("google_calendar_integration.schedule_modal.connect")}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 p-5">
            <h3 className="flex items-center gap-2 text-h5-medium text-primary">
              <CalendarPlus className="size-4" />
              {t("google_calendar_integration.schedule_modal.title")}
            </h3>

            <label className="flex flex-col gap-1">
              <span className="text-body-xs-medium text-secondary">
                {t("google_calendar_integration.schedule_modal.field_title")}
              </span>
              <Input value={summary} onChange={(e) => setSummary(e.target.value)} className="w-full" />
            </label>

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-body-xs-medium text-secondary">
                  {t("google_calendar_integration.schedule_modal.field_date")}
                </span>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
              {!allDay && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-body-xs-medium text-secondary">
                      {t("google_calendar_integration.schedule_modal.field_start")}
                    </span>
                    <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-body-xs-medium text-secondary">
                      {t("google_calendar_integration.schedule_modal.field_end")}
                    </span>
                    <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
                  </label>
                </>
              )}
              <label className="flex h-7 items-center gap-2 text-body-sm-regular text-secondary">
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                {t("google_calendar_integration.schedule_modal.field_all_day")}
              </label>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-body-xs-medium text-secondary">
                  {t("google_calendar_integration.schedule_modal.field_guests")}
                </span>
                {assigneeEmails.length > 0 && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-body-xs-medium text-accent-primary hover:underline"
                    onClick={() => addGuest(assigneeEmails.join(","))}
                  >
                    <Users className="size-3" />
                    {t("google_calendar_integration.schedule_modal.add_assignees")}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-subtle px-2 py-1.5">
                {guests.map((email) => (
                  <span
                    key={email}
                    className="flex items-center gap-1 rounded-sm bg-layer-3 px-1.5 py-0.5 text-caption-sm-regular"
                  >
                    {email}
                    <button
                      type="button"
                      aria-label={email}
                      onClick={() => setGuests((prev) => prev.filter((g) => g !== email))}
                      className="text-tertiary hover:text-primary"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={guestInput}
                  onChange={(e) => setGuestInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === "," || e.key === "Tab") && guestInput.trim()) {
                      e.preventDefault();
                      addGuest(guestInput);
                    }
                  }}
                  onBlur={() => guestInput.trim() && addGuest(guestInput)}
                  placeholder={t("google_calendar_integration.schedule_modal.guests_placeholder")}
                  className="min-w-40 flex-1 bg-transparent text-body-sm-regular outline-none placeholder:text-placeholder"
                />
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-body-xs-medium text-secondary">
                {t("google_calendar_integration.schedule_modal.field_notes")}
              </span>
              <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full" />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-body-sm-regular text-secondary">
                <input type="checkbox" checked={withMeet} onChange={(e) => setWithMeet(e.target.checked)} />
                <Video className="size-3.5" />
                {t("google_calendar_integration.schedule_modal.with_meet")}
              </label>
              {writableCalendars.length > 1 && (
                <CustomSelect
                  value={calendarId}
                  label={`${t("google_calendar_integration.schedule_modal.field_calendar")}: ${calendarLabel}`}
                  onChange={(value: string) => setCalendarId(value)}
                  buttonClassName="border border-subtle-1"
                  placement="bottom-end"
                >
                  {writableCalendars.map((calendar) => (
                    <CustomSelect.Option key={calendar.id} value={calendar.primary ? "primary" : calendar.id}>
                      {calendar.summary}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              )}
            </div>

            {error && <p className="text-body-xs-regular text-danger-primary">{error}</p>}
          </div>
          <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-3">
            <Button variant="secondary" size="lg" onClick={onClose} disabled={isSubmitting}>
              {t("google_calendar_integration.schedule_modal.cancel")}
            </Button>
            <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
              {t("google_calendar_integration.schedule_modal.submit")}
            </Button>
          </div>
        </form>
      )}
    </ModalCore>
  );
});
