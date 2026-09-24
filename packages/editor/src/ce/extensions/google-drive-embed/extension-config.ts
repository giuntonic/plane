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
import type { TGoogleDriveEmbedAttributes } from "./types";
import { EGoogleDriveEmbedAttributeNames, GOOGLE_DRIVE_EMBED_DEFAULT_HEIGHT } from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.GOOGLE_DRIVE_EMBED]: {
      insertGoogleDriveEmbed: (attrs?: Partial<TGoogleDriveEmbedAttributes>) => ReturnType;
    };
  }
}

// Pespo: bloco de embed de arquivo do Google Drive. Atom + selecionável/arrastável,
// no mesmo molde do embed do Clapshot. Guarda só a URL do arquivo (o iframe é
// sempre remontado a partir do id extraído dela) e metadados de exibição.
export const GoogleDriveEmbedExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.GOOGLE_DRIVE_EMBED,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      [EGoogleDriveEmbedAttributeNames.URL]: { default: undefined },
      [EGoogleDriveEmbedAttributeNames.NAME]: { default: undefined },
      [EGoogleDriveEmbedAttributeNames.MIME_TYPE]: { default: undefined },
      [EGoogleDriveEmbedAttributeNames.MODE]: {
        default: "preview",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute(EGoogleDriveEmbedAttributeNames.MODE) === "edit" ? "edit" : "preview",
      },
      [EGoogleDriveEmbedAttributeNames.HEIGHT]: {
        default: GOOGLE_DRIVE_EMBED_DEFAULT_HEIGHT,
        parseHTML: (element: HTMLElement) =>
          Number(element.getAttribute(EGoogleDriveEmbedAttributeNames.HEIGHT)) || GOOGLE_DRIVE_EMBED_DEFAULT_HEIGHT,
      },
    };
  },

  // Sem isso o serializador markdown (tiptap-markdown) não sabe lidar com um
  // node type desconhecido e a descrição inteira falha ao salvar como vazia.
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          const attrs = node.attrs as TGoogleDriveEmbedAttributes;
          const url = attrs[EGoogleDriveEmbedAttributeNames.URL];
          if (url) state.write(`[${attrs[EGoogleDriveEmbedAttributeNames.NAME] || "Google Drive"}](${url})`);
          state.closeBlock(node);
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "google-drive-embed-component" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["google-drive-embed-component", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      insertGoogleDriveEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: attrs ?? {} }),
    };
  },
});
