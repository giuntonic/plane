/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Check, Lock, Settings } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Switch } from "@plane/propel/switch";
import { Tooltip } from "@plane/propel/tooltip";
import type { TGoogleCalendarListEntry } from "@plane/types";
import { cn, readableTextColor } from "@plane/utils";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";

type Props = {
  isGoogleConnected: boolean;
  googleEmail?: string;
  calendars: TGoogleCalendarListEntry[];
  selectedCalendarIds: string[];
  onToggleCalendar: (calendarId: string) => void;
  showWorkItems: boolean;
  setShowWorkItems: (value: boolean) => void;
  onlyMine: boolean;
  setOnlyMine: (value: boolean) => void;
  className?: string;
};

function ColorCheckbox(props: { checked: boolean; color: string; label: string; onChange: () => void }) {
  const { checked, color, label, onChange } = props;
  return (
    <span className="relative grid size-4 flex-shrink-0 place-items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="peer absolute inset-0 size-full cursor-pointer opacity-0"
      />
      <span
        className="pointer-events-none grid size-4 place-items-center rounded-[3px] border-2 peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-strong"
        style={{ borderColor: color, backgroundColor: checked ? color : "transparent" }}
      >
        {checked && <Check className="size-3" strokeWidth={3} style={{ color: readableTextColor(color) }} />}
      </span>
    </span>
  );
}

/** Pespo: fontes do calendário — os itens de trabalho e as agendas do Google, com o nome e a cor que
 * cada agenda tem no Google. A escolha das agendas fica salva na conta (as mesmas de antes, nas
 * configurações). */
export const CalendarSyncSidebar = observer(function CalendarSyncSidebar(props: Props) {
  const {
    isGoogleConnected,
    googleEmail,
    calendars,
    selectedCalendarIds,
    onToggleCalendar,
    showWorkItems,
    setShowWorkItems,
    onlyMine,
    setOnlyMine,
    className,
  } = props;
  const { t } = useTranslation();
  const router = useAppRouter();

  return (
    <aside
      className={cn("flex w-64 flex-shrink-0 flex-col gap-6 overflow-y-auto border-r border-subtle p-4", className)}
    >
      <section className="flex flex-col gap-2">
        <h4 className="text-caption-md-medium text-tertiary uppercase">
          {t("google_calendar_integration.calendar_view.work_items")}
        </h4>
        <label className="flex cursor-pointer items-center gap-2 text-body-xs-medium text-primary">
          <ColorCheckbox
            checked={showWorkItems}
            color="#6c5ce7"
            label={t("google_calendar_integration.calendar_view.work_items")}
            onChange={() => setShowWorkItems(!showWorkItems)}
          />
          {t("google_calendar_integration.calendar_view.show_work_items")}
        </label>
        <label
          className={cn("flex items-center justify-between gap-2 pl-6 text-body-xs-regular text-secondary", {
            "opacity-50": !showWorkItems,
          })}
        >
          {t("google_calendar_integration.calendar_view.only_mine")}
          <Switch value={onlyMine} onChange={setOnlyMine} disabled={!showWorkItems} />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-col">
          <h4 className="text-caption-md-medium text-tertiary uppercase">
            {t("google_calendar_integration.calendar_view.google_calendars")}
          </h4>
          {googleEmail && <span className="truncate text-caption-sm-regular text-tertiary">{googleEmail}</span>}
        </div>
        {!isGoogleConnected ? (
          <div className="flex flex-col gap-2 rounded-md border border-dashed border-subtle p-3">
            <p className="text-body-xs-regular text-secondary">
              {t("google_calendar_integration.calendar_view.connect_hint")}
            </p>
            <Button variant="secondary" size="sm" onClick={() => router.push("/settings/profile/google-calendar/")}>
              {t("google_calendar_integration.calendar_view.connect")}
            </Button>
          </div>
        ) : calendars.length === 0 ? (
          <p className="text-body-xs-regular text-tertiary">
            {t("google_calendar_integration.calendar_view.no_calendars")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {calendars.map((calendar) => {
              const color = calendar.background_color || "#039be5";
              const readOnly = calendar.access_role === "reader" || calendar.access_role === "freeBusyReader";
              const details = [calendar.description, calendar.time_zone].filter(Boolean).join(" · ");
              return (
                <li key={calendar.id} className="flex items-center gap-2 text-body-xs-medium text-primary">
                  <ColorCheckbox
                    checked={selectedCalendarIds.includes(calendar.id)}
                    color={color}
                    label={calendar.summary}
                    onChange={() => onToggleCalendar(calendar.id)}
                  />
                  <Tooltip tooltipContent={details || calendar.summary} disabled={!details}>
                    <span className="min-w-0 flex-1 truncate">
                      {calendar.summary}
                      {calendar.primary && (
                        <span className="ml-1 text-caption-sm-regular text-tertiary">
                          ({t("google_calendar_integration.calendar_view.primary")})
                        </span>
                      )}
                    </span>
                  </Tooltip>
                  {readOnly && (
                    <Tooltip tooltipContent={t("google_calendar_integration.calendar_view.read_only")}>
                      <Lock className="size-3 flex-shrink-0 text-tertiary" />
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {isGoogleConnected && (
          <button
            type="button"
            onClick={() => router.push("/settings/profile/google-calendar/")}
            className="mt-1 flex w-fit items-center gap-1 text-caption-sm-medium text-tertiary hover:text-secondary"
          >
            <Settings className="size-3" />
            {t("google_calendar_integration.calendar_view.settings_link")}
          </button>
        )}
      </section>
    </aside>
  );
});
