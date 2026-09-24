/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Switch } from "@plane/propel/switch";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TGoogleCalendarPreferences, TGoogleCalendarProject } from "@plane/types";
import { CustomSelect } from "@plane/ui";
// services
import userService from "@/services/user.service";
// components
import { ProfileSettingsHeading } from "@/components/settings/profile/heading";

export const GOOGLE_CALENDAR_STATUS_SWR_KEY = "google-calendar-status";

const REMINDER_OPTIONS: (number | null)[] = [null, -1, 1, 2, 3, 7];

function SettingRow(props: { title: string; description?: string; children: React.ReactNode }) {
  const { title, description, children } = props;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-body-sm-medium text-primary">{title}</span>
        {description && <span className="text-body-xs-regular text-tertiary">{description}</span>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export const GoogleCalendarProfileSettings = observer(function GoogleCalendarProfileSettings() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSyncing, setIsSyncing] = useState(false);

  const {
    data: status,
    mutate,
    isLoading,
  } = useSWR(GOOGLE_CALENDAR_STATUS_SWR_KEY, () => userService.googleCalendarStatus());

  useEffect(() => {
    const result = searchParams.get("google_calendar");
    if (!result) return;

    if (result === "connected") {
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("profile.google_calendar.connected_title") });
      void mutate();
    } else if (result === "not_configured") {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("profile.google_calendar.not_configured") });
    } else {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("common.something_went_wrong") });
    }
    router.replace("/settings/profile/google-calendar/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const projectsByWorkspace = useMemo(() => {
    const groups = new Map<string, TGoogleCalendarProject[]>();
    if (!status?.connected) return groups;
    for (const project of status.projects) {
      groups.set(project.workspace_name, [...(groups.get(project.workspace_name) ?? []), project]);
    }
    return groups;
  }, [status]);

  const updatePreferences = async (data: Partial<TGoogleCalendarPreferences>) => {
    if (!status?.connected) return;
    // Optimistic: the toggles feel instant, the server answer replaces it.
    void mutate({ ...status, ...data }, { revalidate: false });
    try {
      await userService.updateGoogleCalendarPreferences(data);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("google_calendar_integration.settings.saved") });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("common.something_went_wrong") });
    } finally {
      void mutate();
    }
  };

  const handleToggleOverlay = (calendarId: string, checked: boolean) => {
    if (!status?.connected) return;
    const next = checked
      ? [...status.overlay_calendar_ids, calendarId]
      : status.overlay_calendar_ids.filter((id) => id !== calendarId);
    void updatePreferences({ overlay_calendar_ids: next });
  };

  const handleToggleProject = (projectId: string, checked: boolean) => {
    if (!status?.connected) return;
    const next = checked
      ? [...status.sync_project_ids, projectId]
      : status.sync_project_ids.filter((id) => id !== projectId);
    void updatePreferences({ sync_project_ids: next });
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
    void mutate();
  };

  const reminderLabel = (value: number | null) => {
    if (value === null) return t("google_calendar_integration.settings.reminder_default");
    if (value < 1) return t("google_calendar_integration.settings.reminder_none");
    return t("google_calendar_integration.settings.reminder_days", { count: value });
  };

  if (isLoading || !status) return null;

  return (
    <div className="size-full">
      <ProfileSettingsHeading
        title={t("profile.google_calendar.title")}
        description={t("profile.google_calendar.description")}
      />
      <div className="mt-7 max-w-xl">
        {!status.connected ? (
          <Button variant="primary" onClick={() => (window.location.href = "/api/users/me/google-calendar/connect/")}>
            {t("profile.google_calendar.connect")}
          </Button>
        ) : (
          <div className="flex flex-col gap-8">
            <div className="text-body-md text-secondary">
              {t("profile.google_calendar.connected_as", { email: status.google_email })}
            </div>

            <section className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h4 className="text-body-md-medium text-primary">
                  {t("google_calendar_integration.settings.sync_section")}
                </h4>
                <p className="text-body-xs-regular text-tertiary">
                  {t("google_calendar_integration.settings.sync_description")}
                </p>
              </div>

              <SettingRow title={t("profile.google_calendar.sync_toggle")}>
                <Switch
                  value={status.sync_enabled}
                  onChange={(value) => void updatePreferences({ sync_enabled: value })}
                />
              </SettingRow>

              {status.sync_enabled && (
                <>
                  <SettingRow
                    title={t("google_calendar_integration.settings.two_way_title")}
                    description={`${t("google_calendar_integration.settings.two_way_description")} ${t(
                      status.realtime_enabled
                        ? "google_calendar_integration.settings.realtime_on"
                        : "google_calendar_integration.settings.realtime_off"
                    )}`}
                  >
                    <Switch
                      value={status.two_way_sync}
                      onChange={(value) => void updatePreferences({ two_way_sync: value })}
                    />
                  </SettingRow>

                  <SettingRow
                    title={t("google_calendar_integration.settings.per_project_title")}
                    description={t("google_calendar_integration.settings.per_project_description")}
                  >
                    <Switch
                      value={status.calendar_per_project}
                      onChange={(value) => void updatePreferences({ calendar_per_project: value })}
                    />
                  </SettingRow>

                  <SettingRow
                    title={t("google_calendar_integration.settings.color_title")}
                    description={t("google_calendar_integration.settings.color_description")}
                  >
                    <Switch
                      value={status.color_by_priority}
                      onChange={(value) => void updatePreferences({ color_by_priority: value })}
                    />
                  </SettingRow>

                  <SettingRow title={t("google_calendar_integration.settings.reminders_title")}>
                    <CustomSelect
                      value={status.reminder_days_before}
                      label={reminderLabel(status.reminder_days_before)}
                      onChange={(value: number | null) => void updatePreferences({ reminder_days_before: value })}
                      buttonClassName="border border-subtle-1"
                      className="rounded-md"
                      placement="bottom-end"
                    >
                      {REMINDER_OPTIONS.map((value) => (
                        <CustomSelect.Option key={String(value)} value={value}>
                          {reminderLabel(value)}
                        </CustomSelect.Option>
                      ))}
                    </CustomSelect>
                  </SettingRow>

                  {status.projects.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-body-sm-medium text-primary">
                          {t("google_calendar_integration.settings.projects_title")} ·{" "}
                          <span className="text-tertiary">
                            {status.sync_project_ids.length === 0
                              ? t("google_calendar_integration.settings.projects_all")
                              : t("google_calendar_integration.settings.projects_selected", {
                                  count: status.sync_project_ids.length,
                                })}
                          </span>
                        </span>
                        <span className="text-body-xs-regular text-tertiary">
                          {t("google_calendar_integration.settings.projects_description")}
                        </span>
                      </div>
                      <div className="vertical-scrollbar scrollbar-sm flex max-h-60 flex-col gap-3 overflow-y-auto rounded-md border border-subtle p-3">
                        {[...projectsByWorkspace.entries()].map(([workspaceName, projects]) => (
                          <div key={workspaceName} className="flex flex-col gap-1.5">
                            {projectsByWorkspace.size > 1 && (
                              <span className="text-caption-sm-medium text-tertiary">{workspaceName}</span>
                            )}
                            {projects.map((project) => (
                              <label key={project.id} className="text-body-sm flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={status.sync_project_ids.includes(project.id)}
                                  onChange={(e) => handleToggleProject(project.id, e.target.checked)}
                                />
                                <span className="text-tertiary">{project.identifier}</span>
                                {project.name}
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            {status.calendars.length > 0 && (
              <section className="flex flex-col gap-2">
                <h4 className="text-body-md-medium text-primary">{t("profile.google_calendar.overlay_title")}</h4>
                {status.calendars.map((calendar) => (
                  <label key={calendar.id} className="text-body-sm flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={status.overlay_calendar_ids.includes(calendar.id)}
                      onChange={(e) => handleToggleOverlay(calendar.id, e.target.checked)}
                    />
                    {calendar.background_color && (
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: calendar.background_color }} />
                    )}
                    {calendar.summary}
                  </label>
                ))}
              </section>
            )}

            <div className="flex flex-col gap-3">
              {status.last_synced_at && (
                <div className="text-body-sm text-tertiary">
                  {t("profile.google_calendar.last_synced", {
                    time: new Date(status.last_synced_at).toLocaleString(),
                  })}
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
          </div>
        )}
      </div>
    </div>
  );
});
