/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: reuniões do projeto. Liga o "Solicitar reunião" para o cliente e define quem atende, em que dias e
// horários, com que duração e antecedência. Os horários oferecidos são os livres na agenda do Google de todas
// as pessoas que atendem.
import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TMeetingBooking } from "@plane/types";
import { CustomSelect, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { FeaturesMeetingsProjectSettingsHeader } from "./header";

const DEFAULTS: TMeetingBooking = {
  enabled: false,
  host_ids: [],
  duration_minutes: 30,
  day_start: "09:00",
  day_end: "18:00",
  weekdays: [0, 1, 2, 3, 4],
  notice_hours: 12,
  window_days: 14,
};
const DURATIONS = [15, 30, 45, 60, 90, 120];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-body-sm-medium text-primary">{label}</span>
      {children}
      {hint && <span className="text-body-xs-regular text-tertiary">{hint}</span>}
    </div>
  );
}

function FeaturesMeetingsSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { t } = useTranslation();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentProjectDetails, updateProject } = useProject();
  const [config, setConfig] = useState<TMeetingBooking>(DEFAULTS);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setConfig({ ...DEFAULTS, ...currentProjectDetails?.meeting_booking });
  }, [currentProjectDetails?.meeting_booking]);

  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails?.name} ${t("settings").toLowerCase()} - ${t("project_settings.features.meetings.short_title")}`
    : undefined;
  const canPerformProjectAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);
  if (workspaceUserInfo && !canPerformProjectAdminActions) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  const change = (patch: Partial<TMeetingBooking>) => setConfig((current) => ({ ...current, ...patch }));

  const save = async () => {
    if (config.enabled && (config.host_ids.length === 0 || config.weekdays.length === 0)) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("project_settings.features.meetings.hosts_required") });
      return;
    }
    setIsSaving(true);
    try {
      await updateProject(workspaceSlug, projectId, { meeting_booking: config });
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("project_settings.features.meetings.saved") });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("common.something_went_wrong") });
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    "rounded-md border border-subtle bg-transparent px-2 py-1 text-body-sm-regular text-primary focus:border-accent-strong focus:outline-none";

  return (
    <SettingsContentWrapper header={<FeaturesMeetingsProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <section className="w-full">
        <SettingsHeading
          title={t("project_settings.features.meetings.title")}
          description={t("project_settings.features.meetings.description")}
        />
        <div className="mt-7 flex max-w-xl flex-col gap-6">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-subtle p-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-body-sm-medium text-primary">
                {t("project_settings.features.meetings.toggle_title")}
              </span>
              <span className="text-body-xs-regular text-tertiary">
                {t("project_settings.features.meetings.toggle_description")}
              </span>
            </div>
            <ToggleSwitch value={config.enabled} onChange={() => change({ enabled: !config.enabled })} size="sm" />
          </div>

          <Field
            label={t("project_settings.features.meetings.hosts")}
            hint={t("project_settings.features.meetings.hosts_hint")}
          >
            <div className="w-fit rounded-md border border-subtle">
              <MemberDropdown
                projectId={projectId}
                value={config.host_ids}
                onChange={(hostIds) => change({ host_ids: hostIds })}
                multiple
                buttonVariant="transparent-with-text"
                placeholder={t("project_settings.features.meetings.no_hosts")}
              />
            </div>
          </Field>

          <div className="flex flex-wrap gap-6">
            <Field label={t("project_settings.features.meetings.duration")}>
              <CustomSelect
                value={config.duration_minutes}
                label={t("project_settings.features.meetings.minutes", { count: config.duration_minutes })}
                onChange={(value: number) => change({ duration_minutes: value })}
                buttonClassName={inputClass}
              >
                {DURATIONS.map((minutes) => (
                  <CustomSelect.Option key={minutes} value={minutes}>
                    {t("project_settings.features.meetings.minutes", { count: minutes })}
                  </CustomSelect.Option>
                ))}
              </CustomSelect>
            </Field>
            <Field label={t("project_settings.features.meetings.hours")}>
              <div className="flex items-center gap-2 text-body-sm-regular text-tertiary">
                {t("project_settings.features.meetings.from")}
                <input
                  type="time"
                  step={1800}
                  className={inputClass}
                  value={config.day_start}
                  onChange={(event) => change({ day_start: event.target.value })}
                />
                {t("project_settings.features.meetings.to")}
                <input
                  type="time"
                  step={1800}
                  className={inputClass}
                  value={config.day_end}
                  onChange={(event) => change({ day_end: event.target.value })}
                />
              </div>
            </Field>
          </div>

          <Field label={t("project_settings.features.meetings.weekdays")}>
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                const on = config.weekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() =>
                      change({
                        weekdays: on
                          ? config.weekdays.filter((d) => d !== day)
                          : // oxlint-disable-next-line unicorn/no-array-sort -- cópia nova
                            [...config.weekdays, day].sort(),
                      })
                    }
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-body-xs-medium",
                      on
                        ? "border-accent-strong bg-accent-subtle text-primary"
                        : "border-subtle text-tertiary hover:text-primary"
                    )}
                  >
                    {t(`project_settings.features.meetings.weekday_${day}`)}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="flex flex-wrap gap-6">
            <Field label={t("project_settings.features.meetings.notice")}>
              <input
                type="number"
                min={0}
                max={168}
                className={cn(inputClass, "w-24")}
                value={config.notice_hours}
                onChange={(event) => change({ notice_hours: Number(event.target.value) })}
              />
            </Field>
            <Field label={t("project_settings.features.meetings.window")}>
              <input
                type="number"
                min={1}
                max={60}
                className={cn(inputClass, "w-24")}
                value={config.window_days}
                onChange={(event) => change({ window_days: Number(event.target.value) })}
              />
            </Field>
          </div>

          <div>
            <Button variant="primary" onClick={() => void save()} loading={isSaving} disabled={isSaving}>
              {t("project_settings.features.meetings.save")}
            </Button>
          </div>
        </div>
      </section>
    </SettingsContentWrapper>
  );
}

export default observer(FeaturesMeetingsSettingsPage);
