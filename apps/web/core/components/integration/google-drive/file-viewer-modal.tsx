/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EModalWidth, ModalCore } from "@plane/ui";
import type { TGoogleDriveEmbedMode, TGoogleDriveFileRef } from "@plane/utils";
import { cn, getGoogleDriveEmbedUrl, getGoogleDriveOpenUrl, isGoogleDriveKindEditable } from "@plane/utils";

type Props = {
  file: (TGoogleDriveFileRef & { name: string; iconLink?: string | null }) | null;
  initialMode?: TGoogleDriveEmbedMode;
  onClose: () => void;
};

// Pespo: abre um arquivo do Drive dentro do Plane — "Visualizar" usa o
// previewer do Google (/preview), "Editar" o editor do Docs/Sheets/Slides
// (/edit). Quem autentica é a sessão Google do próprio navegador; se o
// navegador bloquear cookies de terceiros, o botão "Abrir no Google" resolve.
export function GoogleDriveFileViewerModal(props: Props) {
  const { file, initialMode = "preview", onClose } = props;
  const { t } = useTranslation();
  const [mode, setMode] = useState<TGoogleDriveEmbedMode>(initialMode);

  useEffect(() => {
    if (file) setMode(initialMode);
  }, [file, initialMode]);

  if (!file) return null;
  const editable = isGoogleDriveKindEditable(file.kind);
  const src = getGoogleDriveEmbedUrl(file, editable ? mode : "preview");

  return (
    <ModalCore isOpen={!!file} handleClose={onClose} width={EModalWidth.VIIXL}>
      <div className="flex h-[85vh] flex-col">
        <div className="flex items-center gap-3 border-b border-subtle px-4 py-2.5">
          {file.iconLink && <img src={file.iconLink} alt="" className="size-4 flex-shrink-0" />}
          <h3 className="min-w-0 flex-1 truncate text-body-sm-medium text-primary">{file.name}</h3>
          {editable && (
            <div className="flex items-center rounded-md border border-subtle p-0.5">
              {(["preview", "edit"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={cn("rounded-sm px-2 py-0.5 text-body-xs-medium", {
                    "bg-layer-transparent-active text-primary": mode === option,
                    "text-tertiary hover:text-secondary": mode !== option,
                  })}
                >
                  {t(
                    option === "edit"
                      ? "google_drive_integration.viewer.edit_mode"
                      : "google_drive_integration.viewer.view_mode"
                  )}
                </button>
              ))}
            </div>
          )}
          <a
            href={getGoogleDriveOpenUrl(file)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-body-xs-medium text-secondary hover:text-primary"
          >
            <ExternalLink className="size-3.5" />
            {t("google_drive_integration.viewer.open_in_google")}
          </a>
          <button type="button" onClick={onClose} className="text-tertiary hover:text-primary" aria-label="Fechar">
            <X className="size-4" />
          </button>
        </div>
        <iframe
          key={src}
          src={src}
          title={file.name}
          className="w-full flex-1 border-none bg-surface-2"
          allow="clipboard-read; clipboard-write; fullscreen"
          // The src is always built from a validated Drive id on a Google
          // origin, so allow-same-origin only grants Google its own cookies —
          // it never gives the frame access to Plane's origin.
          // oxlint-disable-next-line react/iframe-missing-sandbox -- cross-origin Google src, see above
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
        />
        <p className="border-t border-subtle px-4 py-1.5 text-caption-sm-regular text-tertiary">
          {t("google_drive_integration.viewer.blocked_hint")}
        </p>
      </div>
    </ModalCore>
  );
}
