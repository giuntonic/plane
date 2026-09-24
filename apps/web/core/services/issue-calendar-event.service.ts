/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TIssueCalendarEvent, TIssueCalendarEventCreatePayload } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

// Pespo: reuniões do Google Calendar ligadas a um item de trabalho.
export class IssueCalendarEventService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private basePath(workspaceSlug: string, projectId: string, issueId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/calendar-events/`;
  }

  async list(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueCalendarEvent[]> {
    return this.get(this.basePath(workspaceSlug, projectId, issueId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async schedule(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssueCalendarEventCreatePayload
  ): Promise<TIssueCalendarEvent> {
    return this.post(this.basePath(workspaceSlug, projectId, issueId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** "Meet agora": a Google Meet starting now, inviting the work item's assignees. */
  async startNow(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    durationMinutes?: number
  ): Promise<TIssueCalendarEvent> {
    return this.post(`${this.basePath(workspaceSlug, projectId, issueId)}instant/`, {
      duration_minutes: durationMinutes,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Links an existing Google event to the work item. */
  async link(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: { google_event_id: string; calendar_id?: string }
  ): Promise<TIssueCalendarEvent> {
    return this.post(`${this.basePath(workspaceSlug, projectId, issueId)}link/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Unlinks the meeting; `cancel` also cancels it in Google (organiser only). */
  async remove(workspaceSlug: string, projectId: string, issueId: string, id: string, cancel: boolean): Promise<void> {
    return this.delete(`${this.basePath(workspaceSlug, projectId, issueId)}${id}/`, undefined, {
      params: cancel ? { cancel: "true" } : {},
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const issueCalendarEventService = new IssueCalendarEventService();
