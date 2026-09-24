/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TGoogleDriveCreatableKind,
  TGoogleDriveFile,
  TGoogleDriveFileList,
  TGoogleDriveStatus,
  TGoogleDriveView,
  TIssueAttachment,
  TIssueGoogleDriveFile,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

// Pespo: integração com o Google Drive — conexão pessoal (users/me/google-drive/…)
// e arquivos vinculados/copiados num item de trabalho (…/issues/<id>/google-drive-files/…).
export class GoogleDriveService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** Full-page redirect target that starts the OAuth flow; `nextPath` is where the user lands afterwards. */
  getConnectUrl(nextPath?: string): string {
    const query = nextPath ? `?next_path=${encodeURIComponent(nextPath)}` : "";
    return `${this.baseURL}/api/users/me/google-drive/connect/${query}`;
  }

  async status(): Promise<TGoogleDriveStatus> {
    return this.get("/api/users/me/google-drive/status/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async disconnect(): Promise<void> {
    return this.delete("/api/users/me/google-drive/disconnect/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listFiles(params: {
    view?: TGoogleDriveView;
    search?: string;
    folder_id?: string;
    page_token?: string;
  }): Promise<TGoogleDriveFileList> {
    return this.get("/api/users/me/google-drive/files/", { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createFile(data: {
    kind: TGoogleDriveCreatableKind;
    name: string;
    parent_id?: string;
  }): Promise<TGoogleDriveFile> {
    return this.post("/api/users/me/google-drive/files/", data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listIssueFiles(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueGoogleDriveFile[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/google-drive-files/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async linkIssueFile(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    fileId: string
  ): Promise<TIssueGoogleDriveFile> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/google-drive-files/`, {
      file_id: fileId,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unlinkIssueFile(workspaceSlug: string, projectId: string, issueId: string, id: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/google-drive-files/${id}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Copies the Drive file into Plane as a regular attachment (Docs/Sheets are exported to PDF/XLSX). */
  async importIssueFile(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    fileId: string
  ): Promise<TIssueAttachment> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/google-drive-files/import/`,
      { file_id: fileId }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const googleDriveService = new GoogleDriveService();
