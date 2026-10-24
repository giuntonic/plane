/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// plane imports
import type { TIssueCardExtras } from "@plane/types";
// services
import { issueCardService } from "@/services/issue-card.service";

// Pespo: extras dos cards da lista e do quadro (o "3/5" das subtarefas e a capa). Uma requisição por projeto,
// compartilhada por todos os cards; quem muda o checklist ou a capa atualiza o cache na hora.

export const getCardExtrasKey = (projectId: string) => `PROJECT_CARD_EXTRAS_${projectId}`;

export const useCardExtras = (workspaceSlug: string | undefined, projectId: string | undefined) =>
  useSWR(
    workspaceSlug && projectId ? getCardExtrasKey(projectId) : null,
    () => issueCardService.cardExtras(workspaceSlug as string, projectId as string),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

const patchEntry = (
  current: TIssueCardExtras | undefined,
  issueId: string,
  patch: TIssueCardExtras[string]
): TIssueCardExtras | undefined => {
  if (!current) return current;
  const entry = { ...current[issueId], ...patch };
  for (const field of Object.keys(entry) as (keyof typeof entry)[]) if (entry[field] === undefined) delete entry[field];
  const next = { ...current };
  if (Object.keys(entry).length === 0) delete next[issueId];
  else next[issueId] = entry;
  return next;
};

/** Leva a contagem do checklist aberto para o card do item, sem esperar a próxima busca. */
export const patchChecklistProgress = (
  current: TIssueCardExtras | undefined,
  issueId: string,
  done: number,
  total: number
) => patchEntry(current, issueId, { checklist: total === 0 ? undefined : { done, total } });

export const patchCover = (current: TIssueCardExtras | undefined, issueId: string, cover: string | null) =>
  patchEntry(current, issueId, { cover: cover ?? undefined });
