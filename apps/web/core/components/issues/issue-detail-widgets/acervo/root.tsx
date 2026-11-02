/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import {
  CalendarDays,
  Copy,
  Download,
  ExternalLink,
  FileIcon,
  FolderIcon,
  FolderOpen,
  Link2Off,
  RefreshCw,
  Upload,
} from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TAcervoFile, TAcervoLinkKind, TIssueServiceType } from "@plane/types";
import { Collapsible, CollapsibleButton, Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { formatAcervoSize, parseAcervoDay, useAcervoActions, useIssueAcervo } from "./helper";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueServiceType: TIssueServiceType;
};

const KINDS: TAcervoLinkKind[] = ["upload", "delivery"];
const MAX_FILES = 8;

const actionClassName =
  "grid size-6 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-primary";

const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * Pespo: "Arquivos da peça" — a pasta da peça no Acervo (Nextcloud). Os links de envio (o cliente manda o material
 * bruto) e de entrega (leitura), com validade, e o que já está em Recebido/ e Entrega/. A equipe gera, copia,
 * renova, muda a data e revoga; o cliente vê os links ativos e o que tem nas pastas.
 */
export const AcervoCollapsible = observer(function AcervoCollapsible(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled, issueServiceType } = props;
  const { t, currentLocale } = useTranslation();
  const { openWidgets, toggleOpenWidget } = useIssueDetail(issueServiceType);
  const { data } = useIssueAcervo(workspaceSlug, projectId, issueId);
  const actions = useAcervoActions(workspaceSlug, projectId, issueId);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // o campo de data aparece no clique do calendário e já vem com o foco (sair dele salva)
  useEffect(() => {
    if (editingDate) dateInputRef.current?.focus();
  }, [editingDate]);

  if (!data?.enabled) return null;
  const isTeam = data.is_team;
  const fileCount = data.received.length + data.delivery.length;
  if (!data.folder && data.links.length === 0 && fileCount === 0) return null;

  const isOpen = openWidgets.includes("acervo");
  const linkFor = (kind: TAcervoLinkKind) => data.links.find((link) => link.kind === kind);
  const formatDay = (day: string) =>
    parseAcervoDay(day).toLocaleDateString(currentLocale, { day: "2-digit", month: "2-digit", year: "numeric" });
  const today = new Date();
  const minDay = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  const maxDay = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 365));

  const renderLink = (kind: TAcervoLinkKind) => {
    const link = linkFor(kind);
    const Icon = kind === "upload" ? Upload : Download;
    const title = t(kind === "upload" ? "acervo.upload.title" : "acervo.delivery.title");
    // o cliente vê só os links ativos; sem link, só o de envio ele pode gerar
    if (!link && (!isTeam ? kind !== "upload" : disabled)) return null;
    return (
      <li
        key={kind}
        className={cn("flex items-center gap-3 rounded-md border border-subtle px-3 py-2", {
          "opacity-70": !link || !link.is_active,
        })}
      >
        <Icon className="size-4 flex-shrink-0 text-tertiary" />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-body-sm-medium text-primary">{title}</span>
          <span
            className={cn("block truncate text-caption-sm-regular text-tertiary", {
              "text-danger-primary": !!link && !link.is_active,
            })}
          >
            {!link
              ? t(kind === "upload" ? "acervo.upload.hint" : "acervo.delivery.hint")
              : link.expires_on
                ? t(link.is_active ? "acervo.expires_on" : "acervo.expired_on", { date: formatDay(link.expires_on) })
                : t("acervo.no_expiry")}
          </span>
        </div>
        {editingDate === link?.id && link ? (
          <input
            ref={dateInputRef}
            type="date"
            min={minDay}
            max={maxDay}
            defaultValue={link.expires_on ?? undefined}
            aria-label={t("acervo.change_date")}
            className="rounded-sm border border-subtle bg-surface-1 px-1.5 py-0.5 text-caption-sm-regular text-primary"
            onKeyDown={(event) => event.key === "Escape" && setEditingDate(null)}
            onBlur={(event) => {
              const value = event.target.value;
              setEditingDate(null);
              if (value && value !== link.expires_on) void actions.renew(link, value);
            }}
          />
        ) : (
          <div className="flex flex-shrink-0 items-center gap-0.5">
            {!link && (
              <button
                type="button"
                className="rounded-sm px-2 py-1 text-caption-sm-medium text-accent-primary hover:bg-layer-transparent-hover"
                onClick={() => void actions.createAndCopy(kind)}
              >
                {t("acervo.create_link")}
              </button>
            )}
            {link?.is_active && (
              <>
                <Tooltip tooltipContent={t("acervo.copy_link")}>
                  <button type="button" className={actionClassName} onClick={() => void actions.copy(link)}>
                    <Copy className="size-3.5" />
                  </button>
                </Tooltip>
                <Tooltip tooltipContent={t("acervo.open_link")}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className={actionClassName}>
                    <ExternalLink className="size-3.5" />
                  </a>
                </Tooltip>
              </>
            )}
            {link && isTeam && !disabled && (
              <>
                <Tooltip tooltipContent={t("acervo.renew")}>
                  <button type="button" className={actionClassName} onClick={() => void actions.renew(link)}>
                    <RefreshCw className="size-3.5" />
                  </button>
                </Tooltip>
                {link.is_active && (
                  <Tooltip tooltipContent={t("acervo.change_date")}>
                    <button type="button" className={actionClassName} onClick={() => setEditingDate(link.id)}>
                      <CalendarDays className="size-3.5" />
                    </button>
                  </Tooltip>
                )}
                <Tooltip tooltipContent={t("acervo.revoke")}>
                  <button
                    type="button"
                    className={cn(actionClassName, "hover:text-danger-primary")}
                    onClick={() => void actions.revoke(link)}
                  >
                    <Link2Off className="size-3.5" />
                  </button>
                </Tooltip>
              </>
            )}
          </div>
        )}
      </li>
    );
  };

  const renderFiles = (label: string, files: TAcervoFile[]) =>
    files.length > 0 && (
      <div className="flex flex-col gap-1">
        <span className="pt-1 text-caption-sm-medium text-tertiary">
          {label} · {files.length}
        </span>
        <ul className="flex flex-col">
          {files.slice(0, MAX_FILES).map((file) => (
            <li key={file.name} className="flex items-center gap-2 px-1 py-1 text-body-xs-regular">
              {file.is_folder ? (
                <FolderIcon className="size-3.5 flex-shrink-0 text-tertiary" />
              ) : (
                <FileIcon className="size-3.5 flex-shrink-0 text-tertiary" />
              )}
              <span className="min-w-0 flex-1 truncate text-primary">{file.name}</span>
              {!file.is_folder && (
                <span className="flex-shrink-0 text-tertiary tabular-nums">
                  {formatAcervoSize(file.size, currentLocale)}
                </span>
              )}
              {file.modified && (
                <span className="flex-shrink-0 text-tertiary">
                  {new Date(file.modified).toLocaleDateString(currentLocale, { day: "2-digit", month: "2-digit" })}
                </span>
              )}
            </li>
          ))}
          {files.length > MAX_FILES && (
            <li className="px-1 py-1 text-caption-sm-regular text-tertiary">
              {t("acervo.more_files", { count: files.length - MAX_FILES })}
            </li>
          )}
        </ul>
      </div>
    );

  return (
    <Collapsible
      isOpen={isOpen}
      onToggle={() => toggleOpenWidget("acervo")}
      title={
        <CollapsibleButton
          isOpen={isOpen}
          title={t("acervo.title")}
          indicatorElement={
            fileCount > 0 ? (
              <span className="flex items-center justify-center">
                <p className="text-14 !leading-3 text-tertiary">{fileCount}</p>
              </span>
            ) : undefined
          }
        />
      }
      buttonClassName="w-full"
    >
      <div className="flex flex-col gap-2 px-1.5 pb-2">
        {data.unavailable && <p className="text-caption-sm-regular text-tertiary">{t("acervo.unavailable")}</p>}
        <ul className="flex flex-col gap-1">{KINDS.map(renderLink)}</ul>
        {renderFiles(t("acervo.received"), data.received)}
        {renderFiles(t("acervo.delivered"), data.delivery)}
        {isTeam && data.folder && (
          <button
            type="button"
            className="flex w-fit items-center gap-1.5 rounded-sm px-1 py-1 text-caption-sm-medium text-accent-primary hover:underline"
            onClick={() => void actions.openFolder(data.folder?.files_url)}
          >
            <FolderOpen className="size-3.5" />
            {t("acervo.open_folder")}
          </button>
        )}
      </div>
    </Collapsible>
  );
});
