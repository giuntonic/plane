/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { getFileURL } from "@plane/utils";
// components
import { useCardExtras } from "@/components/issues/card-extras";

type Props = { issueId: string; projectId: string | null | undefined };

/** Pespo: capa do card no quadro (estilo Trello), a partir de um anexo de imagem do item. */
export const KanbanCardCover = observer(function KanbanCardCover(props: Props) {
  const { issueId, projectId } = props;
  const { workspaceSlug } = useParams();
  const { data: cardExtras } = useCardExtras(workspaceSlug?.toString(), projectId ?? undefined);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const cover = cardExtras?.[issueId]?.cover;
  const src = cover ? getFileURL(cover) : undefined;

  if (!src || failedSrc === src) return null;

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setFailedSrc(src)}
      className="-mx-3 -mt-3 mb-1 block max-h-44 w-[calc(100%+1.5rem)] max-w-none rounded-t-lg object-cover"
    />
  );
});
