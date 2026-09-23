/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// services
import { DashboardWidgetService } from "@plane/services";
// types
import type {
  TDashboard,
  TDashboardCreatePayload,
  TDashboardScope,
  TDashboardWidget,
  TDashboardWidgetCreatePayload,
} from "@plane/types";
// plane web store
import type { CoreRootStore } from "./root.store";

const scopeKey = (workspaceSlug: string, dashboardType?: TDashboardScope, projectId?: string) =>
  `${workspaceSlug}::${dashboardType ?? "all"}::${projectId ?? ""}`;

export interface IDashboardsStore {
  // observables
  dashboardsMap: Record<string, TDashboard>;
  dashboardIdsByScope: Record<string, string[]>;
  // computed actions
  getDashboardById: (dashboardId: string) => TDashboard | undefined;
  getDashboardsByScope: (
    workspaceSlug: string,
    dashboardType?: TDashboardScope,
    projectId?: string
  ) => TDashboard[] | undefined;
  // actions
  fetchDashboards: (
    workspaceSlug: string,
    params?: { dashboard_type?: TDashboardScope; project_id?: string }
  ) => Promise<TDashboard[]>;
  fetchDashboardDetails: (workspaceSlug: string, dashboardId: string, projectId?: string) => Promise<TDashboard>;
  createDashboard: (workspaceSlug: string, data: TDashboardCreatePayload, projectId?: string) => Promise<TDashboard>;
  updateDashboard: (
    workspaceSlug: string,
    dashboardId: string,
    data: Partial<TDashboardCreatePayload>,
    projectId?: string
  ) => Promise<TDashboard>;
  deleteDashboard: (workspaceSlug: string, dashboardId: string, projectId?: string) => Promise<void>;
  createWidget: (
    workspaceSlug: string,
    dashboardId: string,
    data: TDashboardWidgetCreatePayload,
    projectId?: string
  ) => Promise<TDashboardWidget>;
  updateWidget: (
    workspaceSlug: string,
    dashboardId: string,
    widgetId: string,
    data: Partial<TDashboardWidgetCreatePayload>,
    projectId?: string
  ) => Promise<TDashboardWidget>;
  deleteWidget: (workspaceSlug: string, dashboardId: string, widgetId: string, projectId?: string) => Promise<void>;
}

export class DashboardsStore implements IDashboardsStore {
  // observables
  dashboardsMap: Record<string, TDashboard> = {};
  dashboardIdsByScope: Record<string, string[]> = {};
  // services
  dashboardWidgetService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      dashboardsMap: observable,
      dashboardIdsByScope: observable,
      fetchDashboards: action,
      fetchDashboardDetails: action,
      createDashboard: action,
      updateDashboard: action,
      deleteDashboard: action,
      createWidget: action,
      updateWidget: action,
      deleteWidget: action,
    });

    this.dashboardWidgetService = new DashboardWidgetService();
  }

  getDashboardById = computedFn((dashboardId: string) => this.dashboardsMap[dashboardId]);

  getDashboardsByScope = computedFn((workspaceSlug: string, dashboardType?: TDashboardScope, projectId?: string) => {
    const ids = this.dashboardIdsByScope[scopeKey(workspaceSlug, dashboardType, projectId)];
    if (!ids) return undefined;
    return ids.map((id) => this.dashboardsMap[id]).filter(Boolean);
  });

  fetchDashboards = async (
    workspaceSlug: string,
    params?: { dashboard_type?: TDashboardScope; project_id?: string }
  ): Promise<TDashboard[]> => {
    const dashboards = await this.dashboardWidgetService.listDashboards(workspaceSlug, params);
    runInAction(() => {
      dashboards.forEach((dashboard) => set(this.dashboardsMap, dashboard.id, dashboard));
      set(
        this.dashboardIdsByScope,
        scopeKey(workspaceSlug, params?.dashboard_type, params?.project_id),
        dashboards.map((dashboard) => dashboard.id)
      );
    });
    return dashboards;
  };

  fetchDashboardDetails = async (
    workspaceSlug: string,
    dashboardId: string,
    projectId?: string
  ): Promise<TDashboard> => {
    const dashboard = await this.dashboardWidgetService.retrieveDashboard(workspaceSlug, dashboardId, projectId);
    runInAction(() => set(this.dashboardsMap, dashboard.id, dashboard));
    return dashboard;
  };

  createDashboard = async (
    workspaceSlug: string,
    data: TDashboardCreatePayload,
    projectId?: string
  ): Promise<TDashboard> => {
    const dashboard = await this.dashboardWidgetService.createDashboard(workspaceSlug, data, projectId);
    runInAction(() => {
      set(this.dashboardsMap, dashboard.id, dashboard);
      const key = scopeKey(workspaceSlug, dashboard.dashboard_type, projectId);
      const existingIds = this.dashboardIdsByScope[key] ?? [];
      set(this.dashboardIdsByScope, key, [...existingIds, dashboard.id]);
    });
    return dashboard;
  };

  updateDashboard = async (
    workspaceSlug: string,
    dashboardId: string,
    data: Partial<TDashboardCreatePayload>,
    projectId?: string
  ): Promise<TDashboard> => {
    const originalDashboard = this.dashboardsMap[dashboardId];
    runInAction(() => set(this.dashboardsMap, dashboardId, { ...originalDashboard, ...data }));
    try {
      const dashboard = await this.dashboardWidgetService.updateDashboard(workspaceSlug, dashboardId, data, projectId);
      runInAction(() => set(this.dashboardsMap, dashboardId, dashboard));
      return dashboard;
    } catch (error) {
      runInAction(() => set(this.dashboardsMap, dashboardId, originalDashboard));
      throw error;
    }
  };

  deleteDashboard = async (workspaceSlug: string, dashboardId: string, projectId?: string): Promise<void> => {
    await this.dashboardWidgetService.deleteDashboard(workspaceSlug, dashboardId, projectId);
    runInAction(() => {
      delete this.dashboardsMap[dashboardId];
      Object.keys(this.dashboardIdsByScope).forEach((key) => {
        this.dashboardIdsByScope[key] = this.dashboardIdsByScope[key].filter((id) => id !== dashboardId);
      });
    });
  };

  createWidget = async (
    workspaceSlug: string,
    dashboardId: string,
    data: TDashboardWidgetCreatePayload,
    projectId?: string
  ): Promise<TDashboardWidget> => {
    const widget = await this.dashboardWidgetService.createWidget(workspaceSlug, dashboardId, data, projectId);
    runInAction(() => {
      const dashboard = this.dashboardsMap[dashboardId];
      if (dashboard) set(this.dashboardsMap, [dashboardId, "widgets"], [...(dashboard.widgets ?? []), widget]);
    });
    return widget;
  };

  updateWidget = async (
    workspaceSlug: string,
    dashboardId: string,
    widgetId: string,
    data: Partial<TDashboardWidgetCreatePayload>,
    projectId?: string
  ): Promise<TDashboardWidget> => {
    const dashboard = this.dashboardsMap[dashboardId];
    const originalWidgets = dashboard?.widgets ?? [];

    runInAction(() => {
      if (!dashboard) return;
      set(
        this.dashboardsMap,
        [dashboardId, "widgets"],
        originalWidgets.map((widget) => (widget.id === widgetId ? { ...widget, ...data } : widget))
      );
    });

    try {
      const widget = await this.dashboardWidgetService.updateWidget(
        workspaceSlug,
        dashboardId,
        widgetId,
        data,
        projectId
      );
      runInAction(() => {
        set(
          this.dashboardsMap,
          [dashboardId, "widgets"],
          (this.dashboardsMap[dashboardId]?.widgets ?? []).map((w) => (w.id === widgetId ? widget : w))
        );
      });
      return widget;
    } catch (error) {
      runInAction(() => {
        if (dashboard) set(this.dashboardsMap, [dashboardId, "widgets"], originalWidgets);
      });
      throw error;
    }
  };

  deleteWidget = async (
    workspaceSlug: string,
    dashboardId: string,
    widgetId: string,
    projectId?: string
  ): Promise<void> => {
    await this.dashboardWidgetService.deleteWidget(workspaceSlug, dashboardId, widgetId, projectId);
    runInAction(() => {
      const dashboard = this.dashboardsMap[dashboardId];
      if (dashboard)
        set(
          this.dashboardsMap,
          [dashboardId, "widgets"],
          (dashboard.widgets ?? []).filter((widget) => widget.id !== widgetId)
        );
    });
  };
}
