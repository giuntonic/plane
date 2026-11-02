/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: funções e serviços da equipe e o atalho "Serviços" do topo.
import { API_BASE_URL } from "@plane/constants";
import type { TTeamRole, TTeamService } from "@plane/types";
import { APIService } from "@/services/api.service";

export class PespoTeamService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private async call<T>(promise: Promise<{ data: T }>): Promise<T> {
    try {
      return (await promise).data;
    } catch (error) {
      throw (error as { response?: { data?: unknown } })?.response?.data;
    }
  }

  catalog(slug: string) {
    return this.call<{ services: TTeamService[]; roles: TTeamRole[] }>(
      this.get(`/api/workspaces/${slug}/team-catalog/`)
    );
  }

  mine(slug: string) {
    return this.call<TTeamService[]>(this.get(`/api/workspaces/${slug}/team-services/mine/`));
  }

  createService(slug: string, data: Partial<TTeamService>) {
    return this.call<TTeamService>(this.post(`/api/workspaces/${slug}/team-services/`, data));
  }

  updateService(slug: string, id: string, data: Partial<TTeamService>) {
    return this.call<TTeamService>(this.patch(`/api/workspaces/${slug}/team-services/${id}/`, data));
  }

  deleteService(slug: string, id: string) {
    return this.call<null>(this.delete(`/api/workspaces/${slug}/team-services/${id}/`));
  }

  createRole(slug: string, data: Partial<TTeamRole>) {
    return this.call<TTeamRole>(this.post(`/api/workspaces/${slug}/team-roles/`, data));
  }

  updateRole(slug: string, id: string, data: Partial<TTeamRole>) {
    return this.call<TTeamRole>(this.patch(`/api/workspaces/${slug}/team-roles/${id}/`, data));
  }

  deleteRole(slug: string, id: string) {
    return this.call<null>(this.delete(`/api/workspaces/${slug}/team-roles/${id}/`));
  }
}

export const pespoTeamService = new PespoTeamService();
