/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TEntityTemplate,
  TEntityTemplateApplyPayload,
  TEntityTemplateApplyResponse,
  TEntityTemplateCreatePayload,
  TEntityTemplateKind,
  TEntityTemplateUpdatePayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

// Pespo: modelos de item de trabalho, módulo, ciclo, página e projeto.
export class EntityTemplateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private baseUrl(workspaceSlug: string) {
    return `/api/workspaces/${workspaceSlug}/templates/`;
  }

  async list(workspaceSlug: string, params: { kind?: TEntityTemplateKind; project_id?: string } = {}) {
    return this.get(this.baseUrl(workspaceSlug), { params })
      .then((response) => response?.data as TEntityTemplate[])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, id: string, projectId?: string) {
    return this.get(`${this.baseUrl(workspaceSlug)}${id}/`, { params: projectId ? { project_id: projectId } : {} })
      .then((response) => response?.data as TEntityTemplate)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: TEntityTemplateCreatePayload) {
    return this.post(this.baseUrl(workspaceSlug), data)
      .then((response) => response?.data as TEntityTemplate)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, id: string, data: TEntityTemplateUpdatePayload) {
    return this.patch(`${this.baseUrl(workspaceSlug)}${id}/`, data)
      .then((response) => response?.data as TEntityTemplate)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, id: string): Promise<void> {
    return this.delete(`${this.baseUrl(workspaceSlug)}${id}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async apply(workspaceSlug: string, id: string, data: TEntityTemplateApplyPayload) {
    return this.post(`${this.baseUrl(workspaceSlug)}${id}/apply/`, data)
      .then((response) => response?.data as TEntityTemplateApplyResponse)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const entityTemplateService = new EntityTemplateService();
