/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { mergeAttributes, Node } from "@tiptap/core";
import type { MarkdownSerializerState } from "@tiptap/pm/markdown";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import type { TClapshotEmbedAttributes } from "./types";
import { EClapshotEmbedAttributeNames } from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.CLAPSHOT_EMBED]: {
      insertClapshotEmbed: (url?: string) => ReturnType;
    };
  }
}

// Pespo: bloco de embed de vídeo (Clapshot). Atom + selecionável/arrastável,
// no mesmo molde do embed nativo de item de trabalho (issue-embed-component).
export const ClapshotEmbedExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.CLAPSHOT_EMBED,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      [EClapshotEmbedAttributeNames.URL]: {
        default: undefined,
      },
    };
  },

  // Sem isso o serializador markdown (tiptap-markdown) não sabe lidar com um
  // node type desconhecido e a descrição inteira falha ao salvar como vazia.
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          const attrs = node.attrs as TClapshotEmbedAttributes;
          const url = attrs[EClapshotEmbedAttributeNames.URL];
          if (url) state.write(`[Clapshot](${url})`);
          state.closeBlock(node);
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "clapshot-embed-component",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["clapshot-embed-component", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      insertClapshotEmbed:
        (url) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { [EClapshotEmbedAttributeNames.URL]: url },
          }),
    };
  },
});
