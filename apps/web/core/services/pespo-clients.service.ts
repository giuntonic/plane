/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: clientes, contratos e logins do cliente (Configurações do espaço de trabalho › Clientes).
import { API_BASE_URL } from "@plane/constants";
import type { TPespoClientDetail, TPespoClientsList, TPespoContractInput, TPespoNewClient } from "@plane/types";
import { APIService } from "@/services/api.service";

export class PespoClientsService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string) {
    return `/api/workspaces/${workspaceSlug}/pespo-clients/`;
  }

  async list(workspaceSlug: string): Promise<TPespoClientsList> {
    return this.get(this.base(workspaceSlug))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: TPespoNewClient) {
    return this.post(this.base(workspaceSlug), data)
      .then(
        (response) =>
          response?.data as {
            client: TPespoClientDetail;
            project: { id: string; identifier: string };
            logins: { email: string; status: string }[];
          }
      )
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async detail(workspaceSlug: string, clientId: string): Promise<TPespoClientDetail> {
    return this.get(`${this.base(workspaceSlug)}${clientId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async renew(workspaceSlug: string, clientId: string, data: TPespoContractInput & { keep_balance: boolean }) {
    return this.post(`${this.base(workspaceSlug)}${clientId}/renew/`, data)
      .then((response) => response?.data as { client: TPespoClientDetail; balance_added: Record<string, number> })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addLogins(workspaceSlug: string, clientId: string, emails: string) {
    return this.post(`${this.base(workspaceSlug)}${clientId}/logins/`, { emails })
      .then((response) => response?.data as { client: TPespoClientDetail })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeLogin(workspaceSlug: string, clientId: string, email: string) {
    return this.delete(`${this.base(workspaceSlug)}${clientId}/logins/`, { email })
      .then((response) => response?.data as TPespoClientDetail)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const pespoClientsService = new PespoClientsService();
