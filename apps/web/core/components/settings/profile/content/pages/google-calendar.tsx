/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Switch } from "@plane/propel/switch";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// services
import userService from "@/services/user.service";
// components
import { ProfileSettingsHeading } from "@/components/settings/profile/heading";

export const GoogleCalendarProfileSettings = observer(function GoogleCalendarProfileSettings() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSyncing, setIsSyncing] = useState(false);

  const {
    data: status,
    mutate,
    isLoading,
  } = useSWR("google-calendar-status", () => userService.googleCalendarStatus());

  useEffect(() => {
    const result = searchParams.get("google_calendar");
    if (!result) return;

    if (result === "connected") {
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("profile.google_calendar.connected_title") });
      mutate();
    } else if (result === "not_configured") {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("profile.google_calendar.not_configured") });
    } else {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("common.something_went_wrong") });
    }
    router.replace("/settings/profile/google-calendar/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleToggleSync = async (value: boolean) => {
    await userService.updateGoogleCalendarPreferences({ sync_enabled: value });
    mutate();
  };

  const handleToggleOverlay = async (calendarId: string, checked: boolean) => {
    if (!status?.connected) return;
    const next = checked
      ? [...status.overlay_calendar_ids, calendarId]
      : status.overlay_calendar_ids.filter((id) => id !== calendarId);
    await userService.updateGoogleCalendarPreferences({ overlay_calendar_ids: next });
    mutate();
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await userService.syncGoogleCalendarNow();
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("profile.google_calendar.sync_now") });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("common.something_went_wrong") });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    await userService.disconnectGoogleCalendar();
    mutate();
  };

  if (isLoading || !status) return null;

  return (
    <div className="size-full">
      <ProfileSettingsHeading
        title={t("profile.google_calendar.title")}
        description={t("profile.google_calendar.description")}
      />
      <div className="mt-7 max-w-lg">
        {!status.connected ? (
          <Button variant="primary" onClick={() => (window.location.href = "/api/users/me/google-calendar/connect/")}>
            {t("profile.google_calendar.connect")}
          </Button>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="text-body-md text-secondary">
              {t("profile.google_calendar.connected_as", { email: status.google_email })}
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-body-md">{t("profile.google_calendar.sync_toggle")}</span>
              <Switch value={status.sync_enabled} onChange={handleToggleSync} />
            </div>

            {status.calendars.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-body-md text-secondary">{t("profile.google_calendar.overlay_title")}</span>
                {status.calendars.map((calendar) => (
                  <label key={calendar.id} className="text-body-sm flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={status.overlay_calendar_ids.includes(calendar.id)}
                      onChange={(e) => handleToggleOverlay(calendar.id, e.target.checked)}
                    />
                    {calendar.summary}
                  </label>
                ))}
              </div>
            )}

            {status.last_synced_at && (
              <div className="text-body-sm text-tertiary">
                {t("profile.google_calendar.last_synced", { time: new Date(status.last_synced_at).toLocaleString() })}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={handleSyncNow} disabled={isSyncing}>
                {isSyncing ? t("profile.google_calendar.syncing") : t("profile.google_calendar.sync_now")}
              </Button>
              <Button variant="error-outline" onClick={handleDisconnect}>
                {t("profile.google_calendar.disconnect")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
