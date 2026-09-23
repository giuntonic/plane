/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Check, ExternalLink, Pencil, ThumbsUp, Trash2, Video } from "lucide-react";
// local imports
import type { TClapshotEmbedAttributes, TClapshotEmbedExtensionOptions } from "../types";
import { EClapshotEmbedAttributeNames } from "../types";

// Pespo: node view do embed de vídeo (Clapshot) — pede a URL da revisão
// quando vazio, renderiza o player em iframe quando preenchido.
export function ClapshotEmbedNodeView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, selected, extension } = props;
  const attrs = node.attrs as TClapshotEmbedAttributes;
  const url = attrs[EClapshotEmbedAttributeNames.URL];
  const { onApproveEdit } = extension.options as TClapshotEmbedExtensionOptions;

  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  const handleApproveEdit = async () => {
    if (!onApproveEdit || approving) return;
    setApproving(true);
    try {
      await onApproveEdit();
      setApproved(true);
    } finally {
      setApproving(false);
    }
  };

  const [draftUrl, setDraftUrl] = useState(url ?? "");
  const [isEditing, setIsEditing] = useState(!url);
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) urlInputRef.current?.focus();
  }, [isEditing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftUrl.trim();
    if (!trimmed) return;
    updateAttributes({ [EClapshotEmbedAttributeNames.URL]: trimmed });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <NodeViewWrapper
        className={`my-2 flex items-center gap-2 rounded-md border border-subtle bg-surface-1 p-3 ${
          selected ? "outline-accent-primary outline outline-2" : ""
        }`}
        contentEditable={false}
      >
        <Video className="size-4 flex-shrink-0 text-tertiary" />
        <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2">
          <input
            ref={urlInputRef}
            type="url"
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            placeholder="Cole o link de revisão do Clapshot..."
            className="w-full rounded-sm border-none bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
          />
          <button
            type="submit"
            disabled={!draftUrl.trim()}
            className="flex-shrink-0 rounded-sm bg-accent-primary px-2.5 py-1 text-11 font-medium text-on-color disabled:opacity-50"
          >
            Inserir
          </button>
          {!!url && (
            <button
              type="button"
              onClick={() => {
                setDraftUrl(url);
                setIsEditing(false);
              }}
              className="flex-shrink-0 rounded-sm px-2 py-1 text-11 text-secondary hover:bg-layer-1"
            >
              Cancelar
            </button>
          )}
        </form>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      className={`group/clapshot-embed relative my-2 overflow-hidden rounded-md border border-subtle bg-surface-1 ${
        selected ? "outline-accent-primary outline outline-2" : ""
      }`}
      contentEditable={false}
    >
      <div className="absolute top-2 right-2 z-[1] flex items-center gap-1 opacity-0 transition-opacity group-hover/clapshot-embed:opacity-100">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm bg-surface-1/90 p-1.5 text-secondary shadow-raised-100 hover:text-primary"
          title="Abrir em nova aba"
        >
          <ExternalLink className="size-3.5" />
        </a>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="rounded-sm bg-surface-1/90 p-1.5 text-secondary shadow-raised-100 hover:text-primary"
          title="Editar link"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => deleteNode()}
          className="rounded-sm bg-surface-1/90 p-1.5 text-secondary shadow-raised-100 hover:text-danger-primary"
          title="Remover"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="relative w-full pt-[56.25%]">
        <iframe
          src={url}
          title="Revisão de vídeo (Clapshot)"
          className="absolute top-0 left-0 h-full w-full border-none"
          allow="fullscreen"
          // Pespo: a URL vem de um campo digitado pelo usuário — não
          // combinar allow-scripts com allow-same-origin aqui (a dupla
          // permite que o conteúdo do iframe fuja do sandbox).
          sandbox="allow-scripts allow-forms allow-popups allow-presentation"
        />
      </div>
      {onApproveEdit && (
        <div className="flex items-center justify-between gap-2 border-t border-subtle px-3 py-2">
          {approved ? (
            <span className="text-green-600 flex items-center gap-1.5 text-13 font-medium">
              <Check className="size-4" />
              Edição aprovada
            </span>
          ) : (
            <button
              type="button"
              onClick={handleApproveEdit}
              disabled={approving}
              className="flex items-center gap-1.5 rounded-sm bg-accent-primary px-2.5 py-1 text-13 font-medium text-on-color disabled:opacity-50"
            >
              <ThumbsUp className="size-3.5" />
              {approving ? "Aprovando..." : "Aprovar edição"}
            </button>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}
