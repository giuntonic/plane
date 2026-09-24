/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { ExternalLink, HardDrive, Pencil, Trash2 } from "lucide-react";
// plane imports
import type { TGoogleDriveEmbedMode } from "@plane/utils";
import {
  getGoogleDriveEmbedUrl,
  getGoogleDriveKindFromMimeType,
  getGoogleDriveOpenUrl,
  isGoogleDriveKindEditable,
  parseGoogleDriveUrl,
} from "@plane/utils";
// local imports
import type { TGoogleDriveEmbedAttributes, TGoogleDriveEmbedExtensionOptions, TGoogleDrivePickedFile } from "../types";
import {
  EGoogleDriveEmbedAttributeNames,
  GOOGLE_DRIVE_EMBED_MAX_HEIGHT,
  GOOGLE_DRIVE_EMBED_MIN_HEIGHT,
} from "../types";

const KIND_LABELS: Record<string, string> = {
  document: "Google Docs",
  spreadsheet: "Google Sheets",
  presentation: "Google Slides",
  drawing: "Google Drawings",
  folder: "Pasta do Google Drive",
  file: "Google Drive",
};

// Pespo: node view do embed do Google Drive — quando vazio pede um link (ou
// abre o seletor do Drive do apps/web); quando preenchido mostra o arquivo em
// iframe, em modo "Visualizar" (/preview) ou "Editar" (/edit, só Docs/Sheets/
// Slides/Drawings). O iframe é sempre montado a partir do id validado, nunca da
// URL crua salva no documento.
export function GoogleDriveEmbedNodeView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, selected, extension, editor } = props;
  const attrs = node.attrs as TGoogleDriveEmbedAttributes;
  const url = attrs[EGoogleDriveEmbedAttributeNames.URL];
  const { onPickGoogleDriveFile, getPreviewUrl } = extension.options as TGoogleDriveEmbedExtensionOptions;
  const isEditable = editor.isEditable;

  const ref = parseGoogleDriveUrl(url);
  // A link pasted by hand has no mime type — the URL path already says what it is.
  const kind =
    ref?.kind === "file" && attrs[EGoogleDriveEmbedAttributeNames.MIME_TYPE]
      ? getGoogleDriveKindFromMimeType(attrs[EGoogleDriveEmbedAttributeNames.MIME_TYPE])
      : (ref?.kind ?? "file");
  const fileRef = ref ? { fileId: ref.fileId, kind } : null;
  const editableKind = isGoogleDriveKindEditable(kind);

  const [mode, setMode] = useState<TGoogleDriveEmbedMode>(attrs[EGoogleDriveEmbedAttributeNames.MODE] ?? "preview");
  const [draftUrl, setDraftUrl] = useState(url ?? "");
  const [isEditingLink, setIsEditingLink] = useState(!url);
  const [error, setError] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [height, setHeight] = useState(attrs[EGoogleDriveEmbedAttributeNames.HEIGHT]);
  const [isResizing, setIsResizing] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingLink) urlInputRef.current?.focus();
  }, [isEditingLink]);

  const savedHeight = attrs[EGoogleDriveEmbedAttributeNames.HEIGHT];
  useEffect(() => {
    setHeight(savedHeight);
  }, [savedHeight]);

  const applyPickedFile = (file: TGoogleDrivePickedFile) => {
    const link = file.web_view_link ?? "";
    if (!parseGoogleDriveUrl(link)) {
      setError("Esse arquivo não pode ser incorporado.");
      return;
    }
    updateAttributes({
      [EGoogleDriveEmbedAttributeNames.URL]: link,
      [EGoogleDriveEmbedAttributeNames.NAME]: file.name,
      [EGoogleDriveEmbedAttributeNames.MIME_TYPE]: file.mime_type,
    });
    setDraftUrl(link);
    setError(null);
    setIsEditingLink(false);
  };

  const handlePick = async () => {
    if (!onPickGoogleDriveFile || isPicking) return;
    setIsPicking(true);
    try {
      const file = await onPickGoogleDriveFile();
      if (file) applyPickedFile(file);
    } finally {
      setIsPicking(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftUrl.trim();
    if (!trimmed) return;
    if (!parseGoogleDriveUrl(trimmed)) {
      setError("Cole um link do Google Docs, Sheets, Slides ou Drive.");
      return;
    }
    updateAttributes({
      [EGoogleDriveEmbedAttributeNames.URL]: trimmed,
      // Metadata of a previously picked file no longer applies to a new link.
      [EGoogleDriveEmbedAttributeNames.NAME]: trimmed === url ? attrs[EGoogleDriveEmbedAttributeNames.NAME] : undefined,
      [EGoogleDriveEmbedAttributeNames.MIME_TYPE]:
        trimmed === url ? attrs[EGoogleDriveEmbedAttributeNames.MIME_TYPE] : undefined,
    });
    setError(null);
    setIsEditingLink(false);
  };

  const handleModeChange = (next: TGoogleDriveEmbedMode) => {
    setMode(next);
    // Persist the author's choice; readers can still switch locally.
    if (isEditable) updateAttributes({ [EGoogleDriveEmbedAttributeNames.MODE]: next });
  };

  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;
    let latest = startHeight;
    setIsResizing(true);

    const onMove = (event: PointerEvent) => {
      latest = Math.min(
        GOOGLE_DRIVE_EMBED_MAX_HEIGHT,
        Math.max(GOOGLE_DRIVE_EMBED_MIN_HEIGHT, Math.round(startHeight + event.clientY - startY))
      );
      setHeight(latest);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setIsResizing(false);
      updateAttributes({ [EGoogleDriveEmbedAttributeNames.HEIGHT]: latest });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const outline = selected ? "outline-accent-primary outline outline-2" : "";

  if (isEditingLink || !fileRef) {
    if (!isEditable) {
      // Read-only view of an empty/invalid block: nothing useful to show.
      return <NodeViewWrapper className="hidden" contentEditable={false} />;
    }
    return (
      <NodeViewWrapper
        className={`my-2 flex flex-col gap-2 rounded-md border border-subtle bg-surface-1 p-3 ${outline}`}
        contentEditable={false}
      >
        <div className="flex items-center gap-2">
          <HardDrive className="size-4 flex-shrink-0 text-tertiary" />
          <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2">
            <input
              ref={urlInputRef}
              type="url"
              value={draftUrl}
              onChange={(e) => {
                setDraftUrl(e.target.value);
                setError(null);
              }}
              placeholder="Cole o link de um arquivo do Google Docs, Sheets, Slides ou Drive..."
              className="w-full rounded-sm border-none bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
            />
            <button
              type="submit"
              disabled={!draftUrl.trim()}
              className="flex-shrink-0 rounded-sm bg-accent-primary px-2.5 py-1 text-11 font-medium text-on-color disabled:opacity-50"
            >
              Inserir
            </button>
            {onPickGoogleDriveFile && (
              <button
                type="button"
                onClick={() => void handlePick()}
                disabled={isPicking}
                className="flex-shrink-0 rounded-sm border border-subtle px-2.5 py-1 text-11 font-medium text-secondary hover:bg-layer-1 disabled:opacity-50"
              >
                {isPicking ? "Abrindo..." : "Escolher do Drive"}
              </button>
            )}
            {!!url && (
              <button
                type="button"
                onClick={() => {
                  setDraftUrl(url);
                  setError(null);
                  setIsEditingLink(false);
                }}
                className="flex-shrink-0 rounded-sm px-2 py-1 text-11 text-secondary hover:bg-layer-1"
              >
                Cancelar
              </button>
            )}
          </form>
        </div>
        {error && <p className="text-11 text-danger-primary">{error}</p>}
      </NodeViewWrapper>
    );
  }

  const title = attrs[EGoogleDriveEmbedAttributeNames.NAME] || KIND_LABELS[kind] || "Google Drive";
  const isEditingInGoogle = editableKind && mode === "edit";
  // "Visualizar" prefers Plane's own preview: Google's embed needs third-party
  // cookies, which many browsers block ("ative os cookies").
  const proxySrc = isEditingInGoogle ? "" : (getPreviewUrl?.(fileRef) ?? "");
  const src = proxySrc || getGoogleDriveEmbedUrl(fileRef, isEditingInGoogle ? "edit" : "preview");

  return (
    <NodeViewWrapper
      className={`my-2 overflow-hidden rounded-md border border-subtle bg-surface-1 ${outline}`}
      contentEditable={false}
    >
      <div className="flex items-center gap-2 border-b border-subtle px-3 py-1.5">
        <HardDrive className="size-3.5 flex-shrink-0 text-tertiary" />
        <span className="min-w-0 flex-1 truncate text-13 font-medium text-primary">{title}</span>
        {editableKind && (
          <div className="flex flex-shrink-0 items-center rounded-sm border border-subtle p-0.5">
            {(["preview", "edit"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleModeChange(option)}
                className={`rounded-sm px-2 py-0.5 text-11 font-medium ${
                  mode === option ? "bg-layer-1 text-primary" : "text-tertiary hover:text-secondary"
                }`}
              >
                {option === "edit" ? "Editar" : "Visualizar"}
              </button>
            ))}
          </div>
        )}
        <a
          href={getGoogleDriveOpenUrl(fileRef)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 rounded-sm p-1 text-secondary hover:text-primary"
          title="Abrir no Google"
        >
          <ExternalLink className="size-3.5" />
        </a>
        {isEditable && (
          <>
            <button
              type="button"
              onClick={() => setIsEditingLink(true)}
              className="flex-shrink-0 rounded-sm p-1 text-secondary hover:text-primary"
              title="Trocar arquivo"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => deleteNode()}
              className="flex-shrink-0 rounded-sm p-1 text-secondary hover:text-danger-primary"
              title="Remover"
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
      </div>
      <div className="relative w-full" style={{ height }}>
        {proxySrc ? (
          // Plane's own API response (PDF/image, or a message page that sets its
          // own CSP sandbox). A sandbox here would stop the browser's PDF viewer.
          // oxlint-disable-next-line react/iframe-missing-sandbox -- same-origin preview, see above
          <iframe key={src} src={src} title={title} className="absolute top-0 left-0 h-full w-full border-none" />
        ) : (
          <iframe
            key={src}
            src={src}
            title={title}
            className="absolute top-0 left-0 h-full w-full border-none"
            allow="clipboard-read; clipboard-write; fullscreen; storage-access"
            // Pespo: diferente do Clapshot, a src aqui nunca é a URL digitada — é
            // montada a partir do id validado, sempre num domínio do Google. Por
            // isso allow-same-origin é seguro (dá ao Google os próprios cookies,
            // necessários pra editar) e não expõe a origem do Plane.
            // allow-storage-access-by-user-activation deixa o botão "ativar
            // cookies" do Google pedir acesso quando o navegador os bloqueia.
            // oxlint-disable-next-line react/iframe-missing-sandbox -- cross-origin Google src, see above
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
          />
        )}
        {/* Keeps the iframe from swallowing pointer events while resizing. */}
        {isResizing && <div className="absolute inset-0 cursor-row-resize" />}
      </div>
      {isEditable && (
        <div
          role="separator"
          aria-orientation="horizontal"
          onPointerDown={handleResizeStart}
          className="flex h-2 cursor-row-resize items-center justify-center border-t border-subtle hover:bg-layer-1"
        >
          <span className="h-0.5 w-8 rounded-full bg-layer-3" />
        </div>
      )}
    </NodeViewWrapper>
  );
}
