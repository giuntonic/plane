/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TIssueCardExtras } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

// Pespo: o que os cards mostram além dos campos do item (progresso das subtarefas, capa) e a capa do item.
export class IssueCardService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** Uma requisição por projeto, compartilhada por todos os cards. */
  async cardExtras(workspaceSlug: string, projectId: string): Promise<TIssueCardExtras> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/card-extras/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Põe um anexo de imagem como capa do card, ou tira a capa (`null`). */
  async setCover(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    attachmentId: string | null
  ): Promise<{ cover: string | null }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/cover/`, {
      attachment_id: attachmentId,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const issueCardService = new IssueCardService();
