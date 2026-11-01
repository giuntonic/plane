/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Trash2, VideoOff } from "lucide-react";
import { i18nInstance } from "@plane/i18n";
// local imports
import type { TClapshotEmbedAttributes } from "../types";
import { EClapshotEmbedAttributeNames } from "../types";

// Pespo: o Clapshot foi desligado (1.6). Um bloco /clapshot antigo não tem mais o que mostrar: fica um
// aviso, com o link antigo como texto e o botão de tirar o bloco. A revisão de vídeo agora é a do item.
export function ClapshotEmbedNodeView(props: NodeViewProps) {
  const { node, deleteNode, selected, editor } = props;
  const url = (node.attrs as TClapshotEmbedAttributes)[EClapshotEmbedAttributeNames.URL];

  return (
    <NodeViewWrapper
      className={`my-2 flex items-start gap-2 rounded-md border border-dashed border-subtle bg-layer-1 p-3 ${
        selected ? "outline-accent-primary outline outline-2" : ""
      }`}
      contentEditable={false}
    >
      <VideoOff className="mt-0.5 size-4 flex-shrink-0 text-tertiary" />
      <div className="min-w-0 flex-1">
        <p className="text-13 font-medium text-secondary">{i18nInstance.t("editor_ui.clapshot.title")}</p>
        <p className="text-12 text-tertiary">{i18nInstance.t("editor_ui.clapshot.retired")}</p>
        {url && <p className="mt-1 truncate text-11 text-placeholder">{url}</p>}
      </div>
      {editor.isEditable && (
        <button
          type="button"
          onClick={() => deleteNode()}
          aria-label={i18nInstance.t("editor_ui.clapshot.remove")}
          title={i18nInstance.t("editor_ui.clapshot.remove")}
          className="flex-shrink-0 rounded-sm p-1.5 text-secondary hover:bg-layer-transparent-hover hover:text-danger-primary"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </NodeViewWrapper>
  );
}
