/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { CalendarDays, Check, ChevronDown, RefreshCw, Settings2 } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TGoogleCalendarListEntry, THomeWidgetConfig, THomeWidgetProps } from "@plane/types";
import { CustomMenu, Loader } from "@plane/ui";
import { addDaysToDateKey, buildAgenda, cn, getAgendaRange, toLocalDateKey } from "@plane/utils";
// hooks
import { useHome } from "@/hooks/store/use-home";
import { useAppRouter } from "@/hooks/use-app-router";
// services
import userService from "@/services/user.service";
// local imports
import { AgendaEventRow } from "./event-row";

const DEFAULT_CALENDAR_IDS = ["primary"];
const DEFAULT_DAYS = 7;
const DAY_OPTIONS = [1, 3, 7, 14];
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const CLOCK_INTERVAL_MS = 60 * 1000;

/** "primary" stands for the main calendar, whatever its real id (the Google e-mail) is. */
const isCalendarSelected = (calendar: TGoogleCalendarListEntry, selectedIds: string[]) =>
  selectedIds.includes(calendar.id) || (calendar.primary && selectedIds.includes("primary"));

// Pespo: widget "Agenda" da home — reuniões e compromissos do Google Calendar de quem está vendo,
// com o botão de entrar na reunião. As agendas e o período ficam no config do widget.
export const DashboardAgenda = observer(function DashboardAgenda(props: THomeWidgetProps) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const router = useAppRouter();
  const { widgetsMap, updateWidgetConfig } = useHome();
  // the clock moves the "now" highlight and, at midnight, the range
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), CLOCK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
  // derived values
  const config: THomeWidgetConfig = widgetsMap.google_calendar?.config ?? {};
  const calendarIds = config.calendar_ids?.length ? config.calendar_ids : DEFAULT_CALENDAR_IDS;
  const days = config.days && DAY_OPTIONS.includes(config.days) ? config.days : DEFAULT_DAYS;
  const today = toLocalDateKey(now);

  const { data: status, isLoading: isStatusLoading } = useSWR("google-calendar-status", () =>
    userService.googleCalendarStatus()
  );
  const isConnected = status?.connected === true;

  const {
    data: events,
    error,
    isLoading: isEventsLoading,
    mutate,
  } = useSWR(
    isConnected ? ["home-agenda", calendarIds.join(","), days, today] : null,
    () => {
      const range = getAgendaRange(new Date(), days);
      return userService.googleCalendarEvents(range.after, range.before, calendarIds);
    },
    { refreshInterval: REFRESH_INTERVAL_MS, revalidateOnFocus: true }
  );

  const agenda = useMemo(() => buildAgenda(events ?? [], now, days), [events, now, days]);
  const hasEvents = agenda.some((day) => day.entries.length > 0);

  const saveConfig = (next: THomeWidgetConfig) => {
    updateWidgetConfig(workspaceSlug, "google_calendar", next).catch(() =>
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("home.agenda.save_failed") })
    );
  };

  const toggleCalendar = (calendar: TGoogleCalendarListEntry) => {
    const selected = isCalendarSelected(calendar, calendarIds);
    const next = selected
      ? calendarIds.filter((id) => id !== calendar.id && !(calendar.primary && id === "primary"))
      : [...calendarIds, calendar.primary ? "primary" : calendar.id];
    saveConfig({ ...config, calendar_ids: next.length ? next : DEFAULT_CALENDAR_IDS });
  };

  const dayLabel = (dateKey: string) => {
    if (dateKey === today) return t("home.agenda.today");
    if (dateKey === addDaysToDateKey(today, 1)) return t("home.agenda.tomorrow");
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      weekday: "long",
      day: "2-digit",
      month: "short",
    });
  };

  const rangeLabel = (value: number) =>
    value === 1 ? t("home.agenda.today") : t("home.agenda.days", { count: value });

  const renderBody = () => {
    if (isStatusLoading || (isConnected && isEventsLoading && !events))
      return (
        <Loader className="flex flex-col gap-2">
          <Loader.Item height="32px" />
          <Loader.Item height="32px" />
          <Loader.Item height="32px" />
        </Loader>
      );
    if (!isConnected)
      return (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-layer-1 px-4 py-6 text-center">
          <CalendarDays className="size-6 text-placeholder" />
          <p className="text-13 text-tertiary">{t("home.agenda.not_connected")}</p>
          <Button variant="secondary" size="sm" onClick={() => router.push("/settings/profile/google-calendar/")}>
            {t("home.agenda.connect")}
          </Button>
        </div>
      );
    if (error)
      return (
        <div className="flex flex-col items-center gap-2 rounded-lg bg-layer-1 px-4 py-6 text-center">
          <p className="text-13 text-tertiary">{t("home.agenda.load_failed")}</p>
          <Button variant="secondary" size="sm" onClick={() => void mutate()}>
            {t("home.agenda.retry")}
          </Button>
        </div>
      );
    if (!hasEvents)
      return (
        <div className="rounded-lg bg-layer-1 py-6 text-center text-13 text-placeholder">
          {days === 1 ? t("home.agenda.empty_today") : t("home.agenda.empty", { count: days })}
        </div>
      );
    return (
      <div className="flex flex-col gap-3">
        {agenda
          .filter((day) => day.entries.length > 0 || day.dateKey === today)
          .map((day) => (
            <div key={day.dateKey} className="flex flex-col gap-0.5">
              <div className="px-2 text-caption-sm-medium text-placeholder first-letter:uppercase">
                {dayLabel(day.dateKey)}
              </div>
              {day.entries.length > 0 ? (
                day.entries.map((entry) => (
                  <AgendaEventRow
                    key={`${entry.event.calendar_id ?? ""}-${entry.event.id}`}
                    workspaceSlug={workspaceSlug}
                    entry={entry}
                  />
                ))
              ) : (
                <div className="px-2 py-1.5 text-caption-sm-regular text-placeholder">
                  {t("home.agenda.free_today")}
                </div>
              )}
            </div>
          ))}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-14 font-semibold text-tertiary">{t("home.agenda.title")}</div>
        {isConnected && (
          <div className="flex items-center gap-1">
            <CustomMenu
              customButton={
                <span className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-caption-sm-medium whitespace-nowrap text-tertiary hover:bg-layer-1 hover:text-secondary">
                  {rangeLabel(days)}
                  <ChevronDown className="size-3" />
                </span>
              }
              placement="bottom-end"
              closeOnSelect
            >
              {DAY_OPTIONS.map((value) => (
                <CustomMenu.MenuItem
                  key={value}
                  onClick={() => saveConfig({ ...config, days: value })}
                  className="flex items-center justify-between gap-2"
                >
                  {rangeLabel(value)}
                  {value === days && <Check className="size-3.5 text-accent-primary" />}
                </CustomMenu.MenuItem>
              ))}
            </CustomMenu>
            <CustomMenu
              customButton={
                <span
                  className="grid size-6 place-items-center rounded-sm text-tertiary hover:bg-layer-1 hover:text-secondary"
                  title={t("home.agenda.calendars")}
                >
                  <Settings2 className="size-3.5" />
                </span>
              }
              placement="bottom-end"
              maxHeight="lg"
              ariaLabel={t("home.agenda.calendars")}
            >
              <div className="px-1 py-1 text-caption-sm-medium text-placeholder">{t("home.agenda.calendars")}</div>
              {(status?.connected ? status.calendars : []).map((calendar) => (
                <CustomMenu.MenuItem
                  key={calendar.id}
                  onClick={() => toggleCalendar(calendar)}
                  className="flex items-center gap-2"
                >
                  <span
                    className="size-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: calendar.background_color ?? undefined }}
                  />
                  <span className="min-w-0 flex-1 truncate">{calendar.summary}</span>
                  <Check
                    className={cn("size-3.5 flex-shrink-0 text-accent-primary", {
                      invisible: !isCalendarSelected(calendar, calendarIds),
                    })}
                  />
                </CustomMenu.MenuItem>
              ))}
            </CustomMenu>
            <button
              type="button"
              onClick={() => void mutate()}
              className="grid size-6 place-items-center rounded-sm text-tertiary hover:bg-layer-1 hover:text-secondary"
              title={t("home.agenda.refresh")}
              aria-label={t("home.agenda.refresh")}
            >
              <RefreshCw className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      {renderBody()}
    </div>
  );
});
