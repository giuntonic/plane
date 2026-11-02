/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TAcervoLink, TAcervoLinkKind } from "@plane/types";
import { copyTextToClipboard } from "@plane/utils";
// services
import { acervoService } from "@/services/acervo.service";

// Pespo: Acervo da peça no Nextcloud. O botão de ação e a seção do item dividem a mesma chave SWR.

export const getIssueAcervoKey = (issueId: string) => `ISSUE_ACERVO_${issueId}`;

export const useIssueAcervo = (workspaceSlug: string, projectId: string, issueId: string) =>
  useSWR(
    workspaceSlug && projectId && issueId ? getIssueAcervoKey(issueId) : null,
    () => acervoService.getIssue(workspaceSlug, projectId, issueId),
    { revalidateOnFocus: true }
  );

const ERROR_KEYS: Record<string, string> = {
  ACERVO_UNAVAILABLE: "acervo.errors.unavailable",
  ACERVO_DISABLED: "acervo.errors.disabled",
  INVALID_DATE: "acervo.errors.invalid_date",
};

export const getAcervoErrorKey = (error: unknown): string => {
  const code = error && typeof error === "object" ? (error as { error?: unknown }).error : undefined;
  return (typeof code === "string" && ERROR_KEYS[code]) || "acervo.errors.generic";
};

/** Tamanho no idioma da tela: "850 KB", "2,1 GB". */
export const formatAcervoSize = (bytes: number, locale?: string) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes || 0;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit >= 3 && value < 100 ? 1 : 0;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)} ${units[unit]}`;
};

/** "2026-12-02" → data local (sem o fuso deslocar o dia). */
export const parseAcervoDay = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
};

/** Abre uma aba no clique (senão o navegador bloqueia) e manda para o endereço quando ele chegar. */
const openTabFor = async (getUrl: () => Promise<string | undefined>) => {
  const tab = window.open("about:blank", "_blank");
  try {
    const url = await getUrl();
    if (tab && url) {
      tab.opener = null;
      tab.location.href = url;
    } else tab?.close();
  } catch (error) {
    tab?.close();
    throw error;
  }
};

export const useAcervoActions = (workspaceSlug: string, projectId: string, issueId: string) => {
  const { t } = useTranslation();
  const { mutate } = useIssueAcervo(workspaceSlug, projectId, issueId);

  const showError = useCallback(
    (error: unknown) =>
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t(getAcervoErrorKey(error)) }),
    [t]
  );

  const copy = useCallback(
    async (link: TAcervoLink) => {
      try {
        await copyTextToClipboard(link.url);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("acervo.link_copied") });
      } catch {
        // sem permissão de área de transferência (ex.: depois de esperar o servidor): o link está na seção
        setToast({ type: TOAST_TYPE.INFO, title: t("acervo.link_ready") });
      }
    },
    [t]
  );

  /** Gera (ou pega o ativo) e copia o endereço. */
  const createAndCopy = useCallback(
    async (kind: TAcervoLinkKind) => {
      try {
        const link = await acervoService.createLink(workspaceSlug, projectId, issueId, kind);
        await mutate();
        await copy(link);
        return link;
      } catch (error) {
        showError(error);
        return undefined;
      }
    },
    [copy, issueId, mutate, projectId, showError, workspaceSlug]
  );

  /** O "Enviar material" do cliente: gera (ou pega) o link de envio e abre a página do Nextcloud. */
  const openUpload = useCallback(async () => {
    try {
      await openTabFor(async () => {
        const link = await acervoService.createLink(workspaceSlug, projectId, issueId, "upload");
        void mutate();
        return link.url;
      });
    } catch (error) {
      showError(error);
    }
  }, [issueId, mutate, projectId, showError, workspaceSlug]);

  const openFolder = useCallback(
    async (filesUrl?: string) => {
      try {
        await openTabFor(async () => {
          if (filesUrl) return filesUrl;
          const folder = await acervoService.ensureIssueFolder(workspaceSlug, projectId, issueId);
          void mutate();
          return folder.files_url;
        });
      } catch (error) {
        showError(error);
      }
    },
    [issueId, mutate, projectId, showError, workspaceSlug]
  );

  const renew = useCallback(
    async (link: TAcervoLink, expiresOn?: string) => {
      try {
        await acervoService.updateLink(
          workspaceSlug,
          projectId,
          issueId,
          link.id,
          expiresOn ? { expires_on: expiresOn } : { renew: true }
        );
        await mutate();
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("acervo.link_updated") });
      } catch (error) {
        showError(error);
      }
    },
    [issueId, mutate, projectId, showError, t, workspaceSlug]
  );

  const revoke = useCallback(
    async (link: TAcervoLink) => {
      // eslint-disable-next-line no-alert
      if (!window.confirm(t("acervo.revoke_confirm"))) return;
      try {
        await acervoService.revokeLink(workspaceSlug, projectId, issueId, link.id);
        await mutate();
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("acervo.link_revoked") });
      } catch (error) {
        showError(error);
      }
    },
    [issueId, mutate, projectId, showError, t, workspaceSlug]
  );

  return { copy, createAndCopy, openUpload, openFolder, renew, revoke };
};
