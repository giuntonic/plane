/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import useSWR from "swr";
import type { TIssueServiceType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// services
import { mediaRenditionService, mediaReviewService } from "@/services/media-review.service";
// local imports
import type {
  TMediaRendition,
  TMediaReviewComment,
  TMediaReviewCommentPayload,
  TMediaReviewCommentUpdate,
} from "./types";

export const getMediaReviewKey = (issueId: string) => `MEDIA_REVIEW_COMMENTS_${issueId}`;

/** Comentários da revisão do item (todas as versões). Cada gravação atualiza também o feed de
 * comentários do item, onde fica a cópia de cada comentário da revisão. */
export function useMediaReview(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  issueServiceType: TIssueServiceType
) {
  const { fetchComments, fetchActivities } = useIssueDetail(issueServiceType);
  const { data, mutate, isLoading } = useSWR(issueId ? getMediaReviewKey(issueId) : null, () =>
    mediaReviewService.list(workspaceSlug, projectId, issueId)
  );

  const refreshFeed = useCallback(() => {
    void fetchComments(workspaceSlug, projectId, issueId);
    void fetchActivities(workspaceSlug, projectId, issueId);
  }, [fetchActivities, fetchComments, issueId, projectId, workspaceSlug]);

  const create = useCallback(
    async (payload: TMediaReviewCommentPayload) => {
      const created = await mediaReviewService.create(workspaceSlug, projectId, issueId, payload);
      await mutate((current) => [...(current ?? []), created], { revalidate: false });
      refreshFeed();
      return created;
    },
    [issueId, mutate, projectId, refreshFeed, workspaceSlug]
  );

  const update = useCallback(
    async (id: string, payload: TMediaReviewCommentUpdate) => {
      const updated = await mediaReviewService.update(workspaceSlug, projectId, issueId, id, payload);
      await mutate((current) => (current ?? []).map((item) => (item.id === id ? updated : item)), {
        revalidate: false,
      });
      if (payload.text !== undefined) refreshFeed();
      return updated;
    },
    [issueId, mutate, projectId, refreshFeed, workspaceSlug]
  );

  const remove = useCallback(
    async (id: string) => {
      await mediaReviewService.remove(workspaceSlug, projectId, issueId, id);
      await mutate((current) => (current ?? []).filter((item) => item.id !== id && item.parent !== id), {
        revalidate: false,
      });
      refreshFeed();
    },
    [issueId, mutate, projectId, refreshFeed, workspaceSlug]
  );

  return {
    comments: data as TMediaReviewComment[] | undefined,
    isLoading,
    create,
    update,
    remove,
    revalidate: () => mutate(),
  };
}

const isConverting = (renditions: TMediaRendition[] | undefined) =>
  !!renditions?.some((item) => item.status === "pending" || item.status === "processing");

/** Conversão dos vídeos do item. Enquanto algum converte, pergunta de novo a cada 5 s. A chave leva os
 * ids dos vídeos, então um vídeo novo (versão enviada agora) já entra na lista. */
export function useMediaRenditions(workspaceSlug: string, projectId: string, issueId: string, videoIds: string[]) {
  const key = videoIds.length ? `MEDIA_RENDITIONS_${issueId}_${videoIds.join(",")}` : null;
  const { data, mutate } = useSWR(key, () => mediaRenditionService.list(workspaceSlug, projectId, issueId), {
    refreshInterval: (latest) => (isConverting(latest) ? 5000 : 0),
    revalidateOnFocus: false,
  });

  const retry = useCallback(
    async (assetId: string) => {
      const updated = await mediaRenditionService.retry(workspaceSlug, projectId, issueId, assetId);
      await mutate((current) => (current ?? []).map((item) => (item.asset === assetId ? updated : item)), {
        revalidate: false,
      });
    },
    [issueId, mutate, projectId, workspaceSlug]
  );

  return { renditions: data, retry };
}
