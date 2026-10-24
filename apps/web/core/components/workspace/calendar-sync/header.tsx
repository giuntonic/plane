/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ChevronLeft, ChevronRight, PanelLeft } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";

export type TCalendarView = "month" | "week";

type Props = {
  title: string;
  view: TCalendarView;
  setView: (view: TCalendarView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onToggleSidebar: () => void;
};

export const CalendarSyncHeader = observer(function CalendarSyncHeader(props: Props) {
  const { title, view, setView, onPrevious, onNext, onToday, onToggleSidebar } = props;
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-4 py-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={t("google_calendar_integration.calendar_view.toggle_sidebar")}
          className="grid size-8 place-items-center rounded-md text-secondary hover:bg-layer-1"
        >
          <PanelLeft className="size-4" />
        </button>
        <Button variant="secondary" size="sm" onClick={onToday}>
          {t("google_calendar_integration.calendar_view.today")}
        </Button>
        <div className="flex items-center">
          <button
            type="button"
            onClick={onPrevious}
            aria-label={t("google_calendar_integration.calendar_view.previous")}
            className="grid size-8 place-items-center rounded-full text-secondary hover:bg-layer-1"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label={t("google_calendar_integration.calendar_view.next")}
            className="grid size-8 place-items-center rounded-full text-secondary hover:bg-layer-1"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <h2 className="text-h5-medium text-primary first-letter:uppercase">{title}</h2>
      </div>
      <div className="flex rounded-md border border-subtle p-0.5" role="tablist">
        {(["month", "week"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={view === option}
            onClick={() => setView(option)}
            className={cn("rounded px-3 py-1 text-body-xs-medium text-secondary", {
              "bg-layer-2 text-primary shadow-raised-100": view === option,
            })}
          >
            {t(`google_calendar_integration.calendar_view.${option}`)}
          </button>
        ))}
      </div>
    </div>
  );
});
