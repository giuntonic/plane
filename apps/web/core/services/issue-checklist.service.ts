/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TIssueChecklist,
  TIssueChecklistConvertResponse,
  TIssueChecklistItem,
  TIssueChecklistItemPayload,
  TIssueChecklistPayload,
  TIssueChecklistProgress,
  TIssueConvertToChecklistResponse,
} from "@plane/types";
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

  async progress(workspaceSlug: string, projectId: string): Promise<TIssueChecklistProgress> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/checklist-progress/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** A linha vira item de trabalho (sub-item deste, por padrão); as sublinhas viram o checklist dele. */
  async convertToWorkItem(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    id: string,
    asSubItem: boolean
  ): Promise<TIssueChecklistConvertResponse> {
    return this.post(`${this.baseUrl(workspaceSlug, projectId, issueId)}${id}/convert/`, { as_sub_item: asSubItem })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Recria em `issueId` (cópia recém-criada) as subtarefas, os links e os sub-itens de `sourceIssueId`. */
  async copyStructure(workspaceSlug: string, projectId: string, issueId: string, sourceIssueId: string) {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/copy-structure/`, {
      source_issue_id: sourceIssueId,
    })
      .then((response) => response?.data as { sub_work_items: number; checklist_items: number })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** O inverso: o item vira linha do checklist de `targetIssueId` e sai (como numa exclusão). */
  async convertToChecklist(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    targetIssueId: string
  ): Promise<TIssueConvertToChecklistResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/convert-to-checklist/`, {
      target_issue_id: targetIssueId,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  private checklistsUrl(workspaceSlug: string, projectId: string, issueId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/checklists/`;
  }

  /** Checklists com nome do item (as linhas de cada uma vêm em `list`, pelo campo `checklist`). */
  async listChecklists(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueChecklist[]> {
    return this.get(this.checklistsUrl(workspaceSlug, projectId, issueId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createChecklist(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssueChecklistPayload
  ): Promise<TIssueChecklist> {
    return this.post(this.checklistsUrl(workspaceSlug, projectId, issueId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateChecklist(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    id: string,
    data: TIssueChecklistPayload
  ): Promise<TIssueChecklist> {
    return this.patch(`${this.checklistsUrl(workspaceSlug, projectId, issueId)}${id}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Apaga a checklist e as linhas dela. */
  async removeChecklist(workspaceSlug: string, projectId: string, issueId: string, id: string): Promise<void> {
    return this.delete(`${this.checklistsUrl(workspaceSlug, projectId, issueId)}${id}/`)
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
