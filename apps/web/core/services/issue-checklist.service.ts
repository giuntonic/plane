/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TIssueChecklistItem, TIssueChecklistItemPayload } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

// Pespo: subtarefas leves (checklist em árvore) de um item de trabalho (…/issues/<id>/checklist-items/…).
export class IssueChecklistService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private baseUrl(workspaceSlug: string, projectId: string, issueId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/checklist-items/`;
  }

  async list(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueChecklistItem[]> {
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
    data: TIssueChecklistItemPayload
  ): Promise<TIssueChecklistItem> {
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
    data: TIssueChecklistItemPayload
  ): Promise<TIssueChecklistItem> {
    return this.patch(`${this.baseUrl(workspaceSlug, projectId, issueId)}${id}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, issueId: string, id: string): Promise<void> {
    return this.delete(`${this.baseUrl(workspaceSlug, projectId, issueId)}${id}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const issueChecklistService = new IssueChecklistService();
