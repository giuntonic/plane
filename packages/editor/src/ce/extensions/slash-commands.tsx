/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { HardDrive, Video } from "lucide-react";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// extensions
import type { TSlashCommandAdditionalOption } from "@/extensions";
import type { TGoogleDriveEmbedExtensionOptions } from "@/plane-editor/extensions/google-drive-embed/types";
// types
import type { IEditorProps } from "@/types";

type Props = Pick<IEditorProps, "disabledExtensions" | "flaggedExtensions">;

export const coreEditorAdditionalSlashCommandOptions = (props: Props): TSlashCommandAdditionalOption[] => {
  const {} = props;

  // Pespo: comando pra embutir uma revisão de vídeo do Clapshot.
  const options: TSlashCommandAdditionalOption[] = [
    {
      commandKey: "clapshot-embed",
      key: "clapshot-embed",
      title: "Clapshot",
      description: "Embutir revisão de vídeo do Clapshot",
      searchTerms: ["clapshot", "video", "vídeo", "embed"],
      icon: <Video className="size-3.5" />,
      section: "general",
      pushAfter: "image",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertClapshotEmbed().run();
      },
    },
    // Pespo: embed de arquivo do Google Drive. Quando o app fornece o seletor
    // do Drive, ele abre direto; senão entra o bloco vazio pedindo o link.
    {
      commandKey: "google-drive-embed",
      key: "google-drive-embed",
      title: "Google Drive",
      description: "Incorporar Google Docs, Sheets, Slides ou arquivo do Drive",
      searchTerms: ["google", "drive", "docs", "sheets", "planilha", "documento", "slides", "embed"],
      icon: <HardDrive className="size-3.5" />,
      section: "general",
      pushAfter: "clapshot-embed",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        const { onPickGoogleDriveFile } = (editor.extensionManager.extensions.find(
          (ext) => ext.name === CORE_EXTENSIONS.GOOGLE_DRIVE_EMBED
        )?.options ?? {}) as TGoogleDriveEmbedExtensionOptions;
        if (!onPickGoogleDriveFile) {
          editor.chain().focus().insertGoogleDriveEmbed().run();
          return;
        }
        // Remember where the command was typed — focus moves to the picker.
        const insertAt = editor.state.selection.from;
        void (async () => {
          const file = await onPickGoogleDriveFile();
          if (!file?.web_view_link || editor.isDestroyed) return;
          editor
            .chain()
            .focus()
            .insertContentAt(insertAt, {
              type: CORE_EXTENSIONS.GOOGLE_DRIVE_EMBED,
              attrs: { url: file.web_view_link, name: file.name, mime_type: file.mime_type },
            })
            .run();
        })();
      },
    },
  ];

  return options;
};
