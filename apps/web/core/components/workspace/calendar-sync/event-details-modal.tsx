/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import {
  CalendarDays,
  Check,
  CircleHelp,
  Clock,
  Link2,
  MapPin,
  Plus,
  SquareArrowOutUpRight,
  UserPlus,
  Video,
  X,
} from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TGoogleCalendarAttendee, TGoogleCalendarEvent, TGoogleCalendarListEntry } from "@plane/types";
import { ModalCore } from "@plane/ui";
import { cn, getEventColors } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useAppRouter } from "@/hooks/use-app-router";
// services
import userService from "@/services/user.service";
// local imports
import { eventDescriptionText, eventRange, formatTime, meetLink } from "./helpers";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  event: TGoogleCalendarEvent | null;
  calendar: TGoogleCalendarListEntry | undefined;
  onClose: () => void;
  onUpdated: (event: TGoogleCalendarEvent) => void;
  onCreateWorkItem: (event: TGoogleCalendarEvent) => void;
};

function ResponseIcon(props: { status?: TGoogleCalendarAttendee["responseStatus"] }) {
  const { status } = props;
  if (status === "accepted") return <Check className="size-3 text-success-primary" strokeWidth={3} />;
  if (status === "declined") return <X className="size-3 text-danger-primary" strokeWidth={3} />;
  if (status === "tentative") return <CircleHelp className="size-3 text-warning-primary" />;
  return <span className="size-2 rounded-full border border-strong" />;
}

const formatWhen = (event: TGoogleCalendarEvent, allDayLabel: string) => {
  const dayOptions: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" };
  if (event.start?.dateTime) {
    const start = new Date(event.start.dateTime);
    const end = event.end?.dateTime ? new Date(event.end.dateTime) : null;
    const sameDay = end && start.toDateString() === end.toDateString();
    if (!end) return `${start.toLocaleDateString(undefined, dayOptions)} · ${formatTime(event.start.dateTime)}`;
    if (sameDay)
      return `${start.toLocaleDateString(undefined, dayOptions)} · ${formatTime(event.start.dateTime)} – ${formatTime(event.end!.dateTime!)}`;
    return `${start.toLocaleString(undefined, { ...dayOptions, hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleString(undefined, { ...dayOptions, hour: "2-digit", minute: "2-digit" })}`;
  }
  const range = eventRange(event);
  if (!range) return allDayLabel;
  const [first, last] = range.map((key) => {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, dayOptions);
  });
  return first === last ? `${first} · ${allDayLabel}` : `${first} – ${last}`;
};

/** Pespo: detalhes de um evento do Google no calendário, com "Adicionar pessoas" (o Google envia o convite). */
export const CalendarEventDetailsModal = observer(function CalendarEventDetailsModal(props: Props) {
  const { event, calendar, onClose, onUpdated, onCreateWorkItem } = props;
  const { t } = useTranslation();
  const router = useAppRouter();
  const {
    getUserDetails,
    workspace: { workspaceMemberIds },
  } = useMember();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const attendees = useMemo(() => event?.attendees ?? [], [event]);
  const attendeeEmails = useMemo(() => new Set(attendees.map((a) => a.email.toLowerCase())), [attendees]);
  const suggestions = useMemo(() => {
    const query = draft.trim().toLowerCase();
    if (!query) return [];
    return (workspaceMemberIds ?? [])
      .map((id) => getUserDetails(id))
      .filter((user): user is NonNullable<typeof user> => !!user?.email && !user.is_bot)
      .filter((user) => !attendeeEmails.has(user.email!.toLowerCase()) && !pending.includes(user.email!.toLowerCase()))
      .filter(
        (user) =>
          user.email!.toLowerCase().includes(query) ||
          user.display_name.toLowerCase().includes(query) ||
          `${user.first_name} ${user.last_name}`.toLowerCase().includes(query)
      )
      .slice(0, 5);
  }, [draft, workspaceMemberIds, getUserDetails, attendeeEmails, pending]);

  if (!event) return null;

  const title = event.summary || t("google_calendar_integration.calendar_view.no_title");
  const colors = getEventColors(event, calendar);
  const link = meetLink(event);
  const description = eventDescriptionText(event.description);
  const linkedIssue = event.plane_issue;
  const canInvite = !!event.organizer?.self || event.guestsCanInviteOthers !== false;

  const addEmail = (raw: string) => {
    const email = raw.trim().replace(/[,;]$/, "").toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("google_calendar_integration.calendar_view.invalid_email") });
      return;
    }
    if (!attendeeEmails.has(email) && !pending.includes(email)) setPending((current) => [...current, email]);
    setDraft("");
  };

  const handleClose = () => {
    setDraft("");
    setPending([]);
    onClose();
  };

  const handleInvite = async () => {
    const emails = draft.trim() ? [...pending, draft.trim().toLowerCase()] : pending;
    if (emails.length === 0 || !event.calendar_id) return;
    if (emails.some((email) => !EMAIL_RE.test(email))) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("google_calendar_integration.calendar_view.invalid_email") });
      return;
    }
    setIsSaving(true);
    try {
      const updated = await userService.googleCalendarAddAttendees(event.calendar_id, event.id, emails);
      onUpdated(updated);
      setPending([]);
      setDraft("");
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("google_calendar_integration.calendar_view.people_added", { count: emails.length }),
      });
    } catch (error) {
      const forbidden = (error as { code?: string } | undefined)?.code === "GOOGLE_CALENDAR_FORBIDDEN";
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(
          forbidden
            ? "google_calendar_integration.calendar_view.add_people_forbidden"
            : "google_calendar_integration.calendar_view.add_people_error"
        ),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalCore isOpen handleClose={handleClose}>
      <div className="flex max-h-[80vh] flex-col">
        <div className="flex items-start gap-3 p-5 pb-3">
          <span className="mt-1.5 size-3.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: colors.background }} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="text-h5-medium break-words text-primary">{title}</h3>
            <p className="flex items-center gap-1.5 text-body-xs-regular text-secondary">
              <Clock className="size-3.5 flex-shrink-0" />
              {formatWhen(event, t("google_calendar_integration.meetings.all_day"))}
            </p>
            {calendar && (
              <p className="flex items-center gap-1.5 text-body-xs-regular text-secondary">
                <CalendarDays className="size-3.5 flex-shrink-0" />
                {calendar.summary}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("close")}
            className="grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-1"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-4">
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1.5 rounded-md bg-accent-primary px-3 py-1.5 text-body-xs-medium text-on-color"
            >
              <Video className="size-4" />
              {t("google_calendar_integration.meetings.join_meet")}
            </a>
          )}

          {event.location && (
            <p className="flex items-start gap-1.5 text-body-xs-regular text-secondary">
              <MapPin className="mt-0.5 size-3.5 flex-shrink-0" />
              <span className="break-words">{event.location}</span>
            </p>
          )}

          <div className="flex flex-col gap-2">
            <h4 className="text-caption-md-medium text-tertiary uppercase">
              {t("google_calendar_integration.calendar_view.guests")} {attendees.length > 0 && `(${attendees.length})`}
            </h4>
            {attendees.length > 0 && (
              <ul className="flex flex-col gap-1">
                {attendees.map((attendee) => (
                  <li key={attendee.email} className="flex items-center gap-2 text-body-xs-regular text-primary">
                    <span className="grid size-4 place-items-center">
                      <ResponseIcon status={attendee.responseStatus} />
                    </span>
                    <span className={cn("truncate", { "text-tertiary": attendee.responseStatus === "declined" })}>
                      {attendee.displayName || attendee.email}
                    </span>
                    {attendee.organizer && (
                      <span className="text-caption-sm-regular text-tertiary">
                        {t("google_calendar_integration.calendar_view.organizer")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canInvite && event.calendar_id && (
              <div className="flex flex-col gap-2 rounded-md border border-subtle p-2">
                <div className="flex flex-wrap items-center gap-1">
                  {pending.map((email) => (
                    <span
                      key={email}
                      className="flex items-center gap-1 rounded-full bg-layer-2 px-2 py-0.5 text-caption-sm-medium text-primary"
                    >
                      {email}
                      <button
                        type="button"
                        aria-label={t("remove")}
                        onClick={() => setPending((current) => current.filter((value) => value !== email))}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <div className="relative min-w-40 flex-1">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "," || e.key === ";") {
                          e.preventDefault();
                          if (suggestions[0] && !draft.includes("@")) addEmail(suggestions[0].email!);
                          else addEmail(draft);
                        } else if (e.key === "Backspace" && !draft && pending.length) {
                          setPending((current) => current.slice(0, -1));
                        }
                      }}
                      placeholder={t("google_calendar_integration.calendar_view.add_people_placeholder")}
                      className="w-full bg-transparent px-1 py-1 text-body-xs-regular text-primary outline-none placeholder:text-placeholder"
                    />
                    {suggestions.length > 0 && (
                      <ul className="absolute top-full left-0 z-10 mt-1 w-72 rounded-md border border-subtle bg-surface-1 p-1 shadow-raised-200">
                        {suggestions.map((user) => (
                          <li key={user.id}>
                            <button
                              type="button"
                              onClick={() => addEmail(user.email!)}
                              className="flex w-full flex-col rounded-sm px-2 py-1 text-left hover:bg-layer-1"
                            >
                              <span className="text-body-xs-medium text-primary">{user.display_name}</span>
                              <span className="text-caption-sm-regular text-tertiary">{user.email}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-caption-sm-regular text-tertiary">
                    {t("google_calendar_integration.calendar_view.add_people_hint")}
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleInvite()}
                    loading={isSaving}
                    disabled={pending.length === 0 && !draft.trim()}
                  >
                    <UserPlus className="size-3.5" />
                    {t("google_calendar_integration.calendar_view.add_people")}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {description && (
            <p className="max-h-40 overflow-y-auto text-body-xs-regular whitespace-pre-wrap text-secondary">
              {description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-subtle px-5 py-3">
          {linkedIssue ? (
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/${linkedIssue.workspace_slug}/browse/${linkedIssue.project_identifier}-${linkedIssue.sequence_id}/`
                )
              }
              className="flex min-w-0 items-center gap-1 text-body-xs-medium text-accent-primary hover:underline"
            >
              <Link2 className="size-3.5 flex-shrink-0" />
              <span className="truncate">{linkedIssue.name}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                handleClose();
                onCreateWorkItem(event);
              }}
              className="flex items-center gap-1 text-body-xs-medium text-accent-primary hover:underline"
            >
              <Plus className="size-3.5" />
              {t("google_calendar_integration.calendar_view.create_work_item")}
            </button>
          )}
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-body-xs-medium text-secondary hover:text-primary"
            >
              {t("google_calendar_integration.meetings.open")}
              <SquareArrowOutUpRight className="size-3.5" />
            </a>
          )}
        </div>
      </div>
    </ModalCore>
  );
});
