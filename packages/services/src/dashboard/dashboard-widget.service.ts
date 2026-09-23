/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TDashboard,
  TDashboardCreatePayload,
  TDashboardScope,
  TDashboardWidget,
  TDashboardWidgetChartResponse,
  TDashboardWidgetCreatePayload,
} from "@plane/types";
import { APIService } from "../api.service";

export class DashboardWidgetService extends APIService {
  constructor(BASE_URL?: string) {
    super(BASE_URL || API_BASE_URL);
  }

  private dashboardsBaseUrl(workspaceSlug: string, projectId?: string) {
    return projectId
      ? `/api/workspaces/${workspaceSlug}/projects/${projectId}/dashboards`
      : `/api/workspaces/${workspaceSlug}/dashboards`;
  }

  async listDashboards(
    workspaceSlug: string,
    params?: { dashboard_type?: TDashboardScope; project_id?: string }
  ): Promise<TDashboard[]> {
    const { project_id, ...rest } = params ?? {};
    return this.get(this.dashboardsBaseUrl(workspaceSlug, project_id) + "/", { params: rest })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieveDashboard(workspaceSlug: string, dashboardId: string, projectId?: string): Promise<TDashboard> {
    return this.get(`${this.dashboardsBaseUrl(workspaceSlug, projectId)}/${dashboardId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createDashboard(workspaceSlug: string, data: TDashboardCreatePayload, projectId?: string): Promise<TDashboard> {
    return this.post(`${this.dashboardsBaseUrl(workspaceSlug, projectId)}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateDashboard(
    workspaceSlug: string,
    dashboardId: string,
    data: Partial<TDashboardCreatePayload>,
    projectId?: string
  ): Promise<TDashboard> {
    return this.patch(`${this.dashboardsBaseUrl(workspaceSlug, projectId)}/${dashboardId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteDashboard(workspaceSlug: string, dashboardId: string, projectId?: string): Promise<void> {
    return this.delete(`${this.dashboardsBaseUrl(workspaceSlug, projectId)}/${dashboardId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listWidgets(workspaceSlug: string, dashboardId: string, projectId?: string): Promise<TDashboardWidget[]> {
    return this.get(`${this.dashboardsBaseUrl(workspaceSlug, projectId)}/${dashboardId}/widgets/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createWidget(
    workspaceSlug: string,
    dashboardId: string,
    data: TDashboardWidgetCreatePayload,
    projectId?: string
  ): Promise<TDashboardWidget> {
    return this.post(`${this.dashboardsBaseUrl(workspaceSlug, projectId)}/${dashboardId}/widgets/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWidget(
    workspaceSlug: string,
    dashboardId: string,
    widgetId: string,
    data: Partial<TDashboardWidgetCreatePayload>,
    projectId?: string
  ): Promise<TDashboardWidget> {
    return this.patch(`${this.dashboardsBaseUrl(workspaceSlug, projectId)}/${dashboardId}/widgets/${widgetId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteWidget(workspaceSlug: string, dashboardId: string, widgetId: string, projectId?: string): Promise<void> {
    return this.delete(`${this.dashboardsBaseUrl(workspaceSlug, projectId)}/${dashboardId}/widgets/${widgetId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getWidgetChartData(
    workspaceSlug: string,
    dashboardId: string,
    widgetId: string,
    projectId?: string
  ): Promise<TDashboardWidgetChartResponse> {
    return this.get(`${this.dashboardsBaseUrl(workspaceSlug, projectId)}/${dashboardId}/widgets/${widgetId}/chart/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export default DashboardWidgetService;
