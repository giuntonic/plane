/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
// components
import type {
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

export const mediaReviewService = new MediaReviewService();
