/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: avisos ao cliente por e-mail (Configurações do projeto › Peças). O cliente são os convidados do
// projeto; cada evento pode ser desligado. Vazio no projeto = tudo ligado (plane.utils.client_notices).
import { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TClientNoticeEvent, TClientNotices } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import { useProject } from "@/hooks/store/use-project";

const EVENTS: TClientNoticeEvent[] = ["delivered", "rework_done", "contract_expiring"];

type Props = { workspaceSlug: string; projectId: string };

export const ClientNoticesSettings = observer(function ClientNoticesSettings({ workspaceSlug, projectId }: Props) {
  const { t } = useTranslation();
  const { getProjectById, updateProject } = useProject();
  const project = getProjectById(projectId);
  const [saving, setSaving] = useState(false);
  const stored: TClientNotices = project?.client_notices ?? {};
  const emailOn = stored.email ?? true;
  const eventOn = (event: TClientNoticeEvent) => stored.events?.[event] ?? true;

  const save = async (next: TClientNotices) => {
    setSaving(true);
    try {
      await updateProject(workspaceSlug, projectId, { client_notices: next });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("common.something_went_wrong") });
    } finally {
      setSaving(false);
    }
  };
  const events = Object.fromEntries(EVENTS.map((event) => [event, eventOn(event)])) as Record<
    TClientNoticeEvent,
    boolean
  >;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-subtle p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-body-sm-medium text-primary">{t("project_settings.client_notices.title")}</span>
          <span className="text-body-xs-regular text-tertiary">{t("project_settings.client_notices.description")}</span>
        </div>
        <ToggleSwitch
          value={emailOn}
          onChange={() => void save({ email: !emailOn, events })}
          size="sm"
          disabled={saving}
        />
      </div>
      <div className={cn("flex flex-col gap-2 border-t border-subtle pt-3", { "opacity-50": !emailOn })}>
        {EVENTS.map((event) => (
          <label key={event} className="flex cursor-pointer items-start gap-2" htmlFor={`client-notice-${event}`}>
            <input
              id={`client-notice-${event}`}
              aria-label={t(`project_settings.client_notices.${event}`)}
              type="checkbox"
              className="mt-0.5"
              checked={events[event]}
              disabled={!emailOn || saving}
              onChange={() => void save({ email: emailOn, events: { ...events, [event]: !events[event] } })}
            />
            <span className="flex flex-col">
              <span className="text-body-xs-medium text-primary">{t(`project_settings.client_notices.${event}`)}</span>
              <span className="text-caption-sm-regular text-tertiary">
                {t(`project_settings.client_notices.${event}_hint`)}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
});
