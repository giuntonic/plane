/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
// components
import type {
  TMediaRendition,
  TMediaReviewComment,
  TMediaReviewCommentPayload,
  TMediaReviewCommentUpdate,
} from "@/components/issues/media-review/types";
// services
import { APIService } from "@/services/api.service";

// Pespo: comentários da revisão de peça (…/issues/<id>/media-review/comments/…).
export class MediaReviewService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private baseUrl(workspaceSlug: string, projectId: string, issueId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/media-review/comments/`;
  }

  async list(workspaceSlug: string, projectId: string, issueId: string): Promise<TMediaReviewComment[]> {
    return this.get(this.baseUrl(workspaceSlug, projectId, issueId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TMediaReviewCommentPayload
  ): Promise<TMediaReviewComment> {
    return this.post(this.baseUrl(workspaceSlug, projectId, issueId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    id: string,
    data: TMediaReviewCommentUpdate
  ): Promise<TMediaReviewComment> {
    return this.patch(`${this.baseUrl(workspaceSlug, projectId, issueId)}${id}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, issueId: string, id: string): Promise<void> {
    return this.delete(`${this.baseUrl(workspaceSlug, projectId, issueId)}${id}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

/** Caminho (relativo à API) de um arquivo gerado pela conversão: redireciona para o armazenamento. */
export function renditionFilePath(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  assetId: string,
  kind: "playback" | "poster" | "sprite"
) {
  return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/media-review/renditions/${assetId}/${kind}/`;
}

export class MediaRenditionService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string, issueId: string): Promise<TMediaRendition[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/media-review/renditions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retry(workspaceSlug: string, projectId: string, issueId: string, assetId: string): Promise<TMediaRendition> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/media-review/renditions/${assetId}/retry/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const mediaReviewService = new MediaReviewService();
export const mediaRenditionService = new MediaRenditionService();
