/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TPieceRequestItem, TProjectPiecesPanel } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

// Pespo: painel de peças do projeto (substitui o embed do Metabase), pedido de peças e de refação.
export class ProjectPiecesService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async panel(workspaceSlug: string, projectId: string): Promise<TProjectPiecesPanel> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pieces/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async requestPieces(workspaceSlug: string, projectId: string, items: TPieceRequestItem[], briefing: string) {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pieces/request/`, { items, briefing })
      .then((response) => response?.data as { created: string[] })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async requestRework(workspaceSlug: string, projectId: string, issueId: string, reason: string) {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/request-rework/`, {
      reason,
    })
      .then((response) => response?.data as { state_id: string; state_name: string; comment_id: string })
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const projectPiecesService = new ProjectPiecesService();
