/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TIssueRecurrence, TIssueRecurrencePayload } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

// Pespo: regra de repetição de um item de trabalho (…/issues/<id>/recurrence/).
export class IssueRecurrenceService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private url(workspaceSlug: string, projectId: string, issueId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/recurrence/`;
  }

  async retrieve(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueRecurrence | null> {
    return this.get(this.url(workspaceSlug, projectId, issueId))
      .then((response) => response?.data?.recurrence ?? null)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async save(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssueRecurrencePayload
  ): Promise<TIssueRecurrence> {
    return this.put(this.url(workspaceSlug, projectId, issueId), data)
      .then((response) => response?.data?.recurrence)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, issueId: string): Promise<void> {
    return this.delete(this.url(workspaceSlug, projectId, issueId))
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const issueRecurrenceService = new IssueRecurrenceService();
