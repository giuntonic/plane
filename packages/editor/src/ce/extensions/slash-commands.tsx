/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Video } from "lucide-react";
// extensions
import type { TSlashCommandAdditionalOption } from "@/extensions";
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
  ];

  return options;
};
