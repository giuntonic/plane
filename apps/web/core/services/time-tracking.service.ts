/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TIssueTimeEntries,
  TIssueTimeEntry,
  TIssueTimeEntryPayload,
  TRunningTimeEntry,
  TStartedTimeEntry,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

// Pespo: tempo gasto por peça (…/issues/<id>/time-entries/…) e o cronômetro de quem está logado.
export class TimeTrackingService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private issueUrl(workspaceSlug: string, projectId: string, issueId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/time-entries/`;
  }

  async list(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueTimeEntries> {
    return this.get(this.issueUrl(workspaceSlug, projectId, issueId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssueTimeEntryPayload
  ): Promise<TIssueTimeEntry> {
    return this.post(this.issueUrl(workspaceSlug, projectId, issueId), data)
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
    data: TIssueTimeEntryPayload
  ): Promise<TIssueTimeEntry> {
    return this.patch(`${this.issueUrl(workspaceSlug, projectId, issueId)}${id}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, issueId: string, id: string): Promise<void> {
    return this.delete(`${this.issueUrl(workspaceSlug, projectId, issueId)}${id}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async start(workspaceSlug: string, projectId: string, issueId: string): Promise<TStartedTimeEntry> {
    return this.post(`${this.issueUrl(workspaceSlug, projectId, issueId)}start/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async running(workspaceSlug: string): Promise<{ running: TRunningTimeEntry | null }> {
    return this.get(`/api/workspaces/${workspaceSlug}/time-entries/running/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async stop(workspaceSlug: string): Promise<{ stopped: TIssueTimeEntry | null }> {
    return this.post(`/api/workspaces/${workspaceSlug}/time-entries/running/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const timeTrackingService = new TimeTrackingService();
