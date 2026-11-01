/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// services
import { googleAccountService } from "@/services/google-account.service";

// Pespo: conectar a conta Google sem sair da tela. Abre o consentimento numa janela; quando ela avisa que
// terminou (postMessage), as telas que dependem da agenda e do Drive se atualizam sozinhas.

export const GOOGLE_ACCOUNT_STATUS_SWR_KEY = "google-account-status";
const GOOGLE_STATUS_KEYS = new Set([GOOGLE_ACCOUNT_STATUS_SWR_KEY, "google-calendar-status", "google-drive-status"]);

export function useGoogleAccountStatus() {
  return useSWR(GOOGLE_ACCOUNT_STATUS_SWR_KEY, () => googleAccountService.status(), { revalidateOnFocus: false });
}

const currentPath = () => `${window.location.pathname}${window.location.search}`;

export function useGoogleConnect(onConnected?: () => void) {
  const { t } = useTranslation();
  const { mutate } = useSWRConfig();
  const [isConnecting, setIsConnecting] = useState(false);
  const isConnectingRef = useRef(false);
  isConnectingRef.current = isConnecting;
  const popupRef = useRef<Window | null>(null);
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  useEffect(() => {
    const handleResult = (data: { type?: string; status?: string } | null) => {
      if (data?.type !== "pespo:google-account") return;
      setIsConnecting(false);
      popupRef.current = null;
      // agenda, Drive e a conta: tudo que mostra "conectar" passa a mostrar o conteúdo
      void mutate((key) => typeof key === "string" && (GOOGLE_STATUS_KEYS.has(key) || key.startsWith("google")));
      if (data.status === "connected") onConnectedRef.current?.();
      else
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message:
            data.status === "not_configured" ? t("google_account.not_configured") : t("common.something_went_wrong"),
        });
    };
    const handleMessage = (event: MessageEvent) => {
      // a janela que abrimos (a API pode ter outra origem em desenvolvimento) ou o próprio Hub
      if (event.origin !== window.location.origin && event.source !== popupRef.current) return;
      handleResult(event.data as { type?: string; status?: string } | null);
    };
    // A página de consentimento do Google pode cortar a ligação com esta janela: o canal do navegador
    // (mesma origem) ainda entrega o resultado.
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("pespo-google-account");
      channel.addEventListener("message", (event: MessageEvent) => {
        if (popupRef.current || isConnectingRef.current) handleResult(event.data as { type?: string; status?: string });
      });
    } catch {
      channel = null;
    }
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      channel?.close();
    };
  }, [mutate, t]);

  // a janela fechada sem terminar libera o botão
  useEffect(() => {
    if (!isConnecting) return;
    const timer = setInterval(() => {
      if (popupRef.current?.closed) {
        popupRef.current = null;
        setIsConnecting(false);
      }
    }, 800);
    return () => clearInterval(timer);
  }, [isConnecting]);

  const connect = useCallback(() => {
    const width = 520;
    const height = 680;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    const popup = window.open(
      googleAccountService.connectUrl({ popup: true, nextPath: currentPath() }),
      "pespo-google-account",
      `popup=yes,width=${width},height=${height},left=${left},top=${top}`
    );
    if (!popup) {
      // janela bloqueada: segue na mesma aba e volta para cá no fim
      window.location.href = googleAccountService.connectUrl({ nextPath: currentPath() });
      return;
    }
    popupRef.current = popup;
    setIsConnecting(true);
    popup.focus();
  }, []);

  return { connect, isConnecting };
}
