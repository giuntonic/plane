/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ChartXAxisProperty } from "./analytics";
import type { TChart } from "./charts";

export type TDashboardScope = "workspace" | "project" | "home";

export type TDashboardChartType =
  | "bar-chart"
  | "line-chart"
  | "area-chart"
  | "pie-chart"
  | "donut-chart"
  | "radar-chart"
  | "scatter-chart";

export type TDashboardWidgetLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type TDashboardWidgetFilters = {
  project_ids?: string[];
  date_filter?: string;
  start_date?: string;
  end_date?: string;
  cycle_id?: string;
  module_id?: string;
  priority?: string[];
  state_group?: string[];
};

export type TDashboardWidget = {
  id: string;
  dashboard: string;
  name: string;
  chart_type: TDashboardChartType;
  x_axis: ChartXAxisProperty;
  group_by: ChartXAxisProperty | null;
  metric: string;
  filters: TDashboardWidgetFilters;
  layout: TDashboardWidgetLayout;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
};

export type TDashboard = {
  id: string;
  workspace: string;
  project: string | null;
  owned_by: string | null;
  name: string;
  description: string;
  dashboard_type: TDashboardScope;
  is_default: boolean;
  widgets: TDashboardWidget[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TDashboardWidgetChartResponse = TChart;

export type TDashboardCreatePayload = Partial<Pick<TDashboard, "name" | "description" | "dashboard_type">>;

export type TDashboardWidgetCreatePayload = Partial<
  Pick<
    TDashboardWidget,
    "name" | "chart_type" | "x_axis" | "group_by" | "metric" | "filters" | "layout" | "sort_order" | "is_visible"
  >
>;
