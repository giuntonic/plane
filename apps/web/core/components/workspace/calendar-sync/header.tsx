/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Switch } from "@plane/propel/switch";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

type Props = {
  activeMonthDate: Date;
  setActiveMonthDate: (date: Date) => void;
  isGoogleConnected: boolean;
  onlyMine: boolean;
  setOnlyMine: (value: boolean) => void;
  showGoogleEvents: boolean;
  setShowGoogleEvents: (value: boolean) => void;
};

export const CalendarSyncHeader = observer(function CalendarSyncHeader(props: Props) {
  const {
    activeMonthDate,
    setActiveMonthDate,
    isGoogleConnected,
    onlyMine,
    setOnlyMine,
    showGoogleEvents,
    setShowGoogleEvents,
  } = props;
  const { t } = useTranslation();
  const router = useAppRouter();

  const goToMonth = (offset: number) => {
    setActiveMonthDate(new Date(activeMonthDate.getFullYear(), activeMonthDate.getMonth() + offset, 1));
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-subtle-1 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => goToMonth(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="w-40 text-center text-body-md-medium">
          {MONTH_LABELS[activeMonthDate.getMonth()]} {activeMonthDate.getFullYear()}
        </span>
        <Button variant="secondary" size="sm" onClick={() => goToMonth(1)}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setActiveMonthDate(new Date())}>
          Hoje
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-body-xs-medium text-secondary">
          <Switch value={onlyMine} onChange={setOnlyMine} />
          {t("google_calendar_integration.calendar_view.only_mine")}
        </label>
        {isGoogleConnected ? (
          <label className="flex items-center gap-2 text-body-xs-medium text-secondary">
            <Switch value={showGoogleEvents} onChange={setShowGoogleEvents} />
            {t("google_calendar_integration.calendar_view.show_google")}
          </label>
        ) : (
          <Button variant="link" onClick={() => router.push("/settings/profile/google-calendar/")}>
            Conectar Google Calendar
          </Button>
        )}
      </div>
    </div>
  );
});
