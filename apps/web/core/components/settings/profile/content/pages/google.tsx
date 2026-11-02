/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Check, HardDrive, Minus } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
// components
import { GoogleMark, useGoogleAccountStatus, useGoogleConnect } from "@/components/integration/google";
import { ProfileSettingsHeading } from "@/components/settings/profile/heading";
// services
import { googleAccountService } from "@/services/google-account.service";
// local imports
import { GoogleCalendarProfileSettings } from "./google-calendar";

function ServiceChip({ icon: Icon, label, on }: { icon: typeof CalendarDays; label: string; on: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-sm border px-2 py-1 text-body-xs-medium",
        on ? "border-success-subtle bg-success-subtle text-success-primary" : "border-subtle text-tertiary"
      )}
    >
      <Icon className="size-3.5" />
      {label}
      {on ? <Check className="size-3" /> : <Minus className="size-3" />}
    </span>
  );
}

/** Pespo: a conta Google numa página só (Configurações › Perfil › Google): conectar e desconectar de uma vez,
 * as opções da agenda e o que o Drive faz no Hub. As páginas antigas ("Google Calendar" e "Google Drive")
 * abrem esta mesma. */
export const GoogleProfileSettings = observer(function GoogleProfileSettings() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: status, mutate } = useGoogleAccountStatus();
  const { connect, isConnecting } = useGoogleConnect(() =>
    setToast({ type: TOAST_TYPE.SUCCESS, title: t("google_account.connected_title") })
  );
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // volta de um consentimento feito na mesma aba (janela bloqueada ou fluxos antigos)
  useEffect(() => {
    const result =
      searchParams.get("google") ?? searchParams.get("google_calendar") ?? searchParams.get("google_drive");
    if (!result) return;
    if (result === "connected") setToast({ type: TOAST_TYPE.SUCCESS, title: t("google_account.connected_title") });
    else if (result === "not_configured")
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("google_account.not_configured") });
    else setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("common.something_went_wrong") });
    void mutate();
    router.replace("/settings/profile/google/");
    // oxlint-disable-next-line hooks/exhaustive-deps -- só ao chegar com o resultado na URL
  }, [searchParams]);

  const disconnect = async () => {
    if (!window.confirm(t("google_account.disconnect_confirm"))) return;
    setIsDisconnecting(true);
    try {
      await googleAccountService.disconnect();
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("google_account.disconnected") });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("common.something_went_wrong") });
    } finally {
      setIsDisconnecting(false);
      void mutate();
    }
  };

  if (!status) return null;
  const connected = status.calendar || status.drive;

  return (
    <div className="size-full">
      <ProfileSettingsHeading title={t("google_account.title")} description={t("google_account.description")} />
      <div className="mt-7 flex max-w-xl flex-col gap-8">
        <section className="flex flex-col gap-4 rounded-lg border border-subtle p-4">
          <div className="flex items-center gap-3">
            <GoogleMark className="size-6 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-body-sm-medium text-primary">
                {connected ? status.google_email : t("google_account.not_connected")}
              </span>
              <span className="text-body-xs-regular text-tertiary">
                {connected ? t("google_account.connected_hint") : t("google_account.prompt_description")}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ServiceChip icon={CalendarDays} label={t("google_account.calendar")} on={status.calendar} />
            <ServiceChip icon={HardDrive} label={t("google_account.drive")} on={status.drive} />
          </div>
          {!status.configured ? (
            <p className="text-body-xs-regular text-danger-primary">{t("google_account.not_configured")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(!status.calendar || !status.drive) && (
                <Button variant="primary" onClick={connect} disabled={isConnecting}>
                  {isConnecting
                    ? t("google_account.connecting")
                    : connected
                      ? t("google_account.connect_missing")
                      : t("google_account.connect")}
                </Button>
              )}
              {connected && (
                <Button variant="error-outline" onClick={() => void disconnect()} disabled={isDisconnecting}>
                  {t("google_account.disconnect")}
                </Button>
              )}
            </div>
          )}
        </section>

        {status.calendar && (
          <section className="flex flex-col gap-4">
            <h3 className="flex items-center gap-2 text-body-md-medium text-primary">
              <CalendarDays className="size-4 text-tertiary" />
              {t("google_account.calendar")}
            </h3>
            <GoogleCalendarProfileSettings embedded />
          </section>
        )}

        {status.drive && (
          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-body-md-medium text-primary">
              <HardDrive className="size-4 text-tertiary" />
              {t("google_account.drive")}
            </h3>
            <p className="text-body-sm text-tertiary">{t("google_drive_integration.how_it_works")}</p>
          </section>
        )}
      </div>
    </div>
  );
});
