/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TAcervoBrowse, TAcervoLink, TAcervoLinkKind, TIssueAcervo, TProjectAcervo } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

// Pespo: Acervo da peça no Nextcloud: links de envio e de entrega no item e a pasta do projeto nas configurações.
export class AcervoService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private issueUrl(workspaceSlug: string, projectId: string, issueId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/acervo/`;
  }

  private projectUrl(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/acervo/`;
  }

  async getIssue(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueAcervo> {
    return this.get(this.issueUrl(workspaceSlug, projectId, issueId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Devolve o link ativo do tipo, se já houver, ou cria um. */
  async createLink(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    kind: TAcervoLinkKind
  ): Promise<TAcervoLink> {
    return this.post(`${this.issueUrl(workspaceSlug, projectId, issueId)}links/`, { kind })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateLink(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    linkId: string,
    data: { renew: true } | { expires_on: string }
  ): Promise<TAcervoLink> {
    return this.patch(`${this.issueUrl(workspaceSlug, projectId, issueId)}links/${linkId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async revokeLink(workspaceSlug: string, projectId: string, issueId: string, linkId: string): Promise<void> {
    return this.delete(`${this.issueUrl(workspaceSlug, projectId, issueId)}links/${linkId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async ensureIssueFolder(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<{ path: string; files_url: string }> {
    return this.post(`${this.issueUrl(workspaceSlug, projectId, issueId)}folder/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProject(workspaceSlug: string, projectId: string): Promise<TProjectAcervo> {
    return this.get(this.projectUrl(workspaceSlug, projectId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Sem `folder`, cria a pasta padrão; com `folder`, passa a usar essa. */
  async setProjectFolder(workspaceSlug: string, projectId: string, folder?: string): Promise<TProjectAcervo> {
    return this.post(this.projectUrl(workspaceSlug, projectId), folder ? { folder } : {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async browse(workspaceSlug: string, projectId: string, path?: string): Promise<TAcervoBrowse> {
    return this.get(`${this.projectUrl(workspaceSlug, projectId)}browse/`, { params: path ? { path } : {} })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createFolder(
    workspaceSlug: string,
    projectId: string,
    path: string,
    name: string
  ): Promise<{ name: string; path: string }> {
    return this.post(`${this.projectUrl(workspaceSlug, projectId)}browse/`, { path, name })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const acervoService = new AcervoService();
