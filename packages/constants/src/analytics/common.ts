/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TAnalyticsTabsBase } from "@plane/types";
import { ChartXAxisProperty, ChartYAxisMetric } from "@plane/types";

export interface IInsightField {
  key: string;
  i18nKey: string;
  i18nProps?: {
    entity?: string;
    entityPlural?: string;
    prefix?: string;
    suffix?: string;
    [key: string]: unknown;
  };
}

export const ANALYTICS_INSIGHTS_FIELDS: Record<TAnalyticsTabsBase, IInsightField[]> = {
  overview: [
    {
      key: "total_users",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "common.users",
      },
    },
    {
      key: "total_admins",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "common.admins",
      },
    },
    {
      key: "total_members",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "common.members",
      },
    },
    {
      key: "total_guests",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "common.guests",
      },
    },
    {
      key: "total_projects",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "common.projects",
      },
    },
    {
      key: "total_work_items",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "common.work_items",
      },
    },
    {
      key: "total_cycles",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "common.cycles",
      },
    },
    {
      key: "total_intake",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "sidebar.intake",
      },
    },
  ],
  "work-items": [
    {
      key: "total_work_items",
      i18nKey: "workspace_analytics.total",
    },
    {
      key: "started_work_items",
      i18nKey: "workspace_analytics.started_work_items",
    },
    {
      key: "backlog_work_items",
      i18nKey: "workspace_analytics.backlog_work_items",
    },
    {
      key: "un_started_work_items",
      i18nKey: "workspace_analytics.un_started_work_items",
    },
    {
      key: "completed_work_items",
      i18nKey: "workspace_analytics.completed_work_items",
    },
  ],
};

export const ANALYTICS_DURATION_FILTER_OPTIONS = [
  {
    name: "Yesterday",
    value: "yesterday",
  },
  {
    name: "Last 7 days",
    value: "last_7_days",
  },
  {
    name: "Last 30 days",
    value: "last_30_days",
  },
  {
    name: "Last 3 months",
    value: "last_3_months",
  },
];

export const ANALYTICS_X_AXIS_VALUES: { value: ChartXAxisProperty; label: string }[] = [
  {
    value: ChartXAxisProperty.STATES,
    label: "State name",
  },
  {
    value: ChartXAxisProperty.STATE_GROUPS,
    label: "State group",
  },
  {
    value: ChartXAxisProperty.PRIORITY,
    label: "Priority",
  },
  {
    value: ChartXAxisProperty.LABELS,
    label: "Label",
  },
  {
    value: ChartXAxisProperty.ASSIGNEES,
    label: "Assignee",
  },
  {
    value: ChartXAxisProperty.ESTIMATE_POINTS,
    label: "Estimate point",
  },
  {
    value: ChartXAxisProperty.CYCLES,
    label: "Cycle",
  },
  {
    value: ChartXAxisProperty.MODULES,
    label: "Module",
  },
  {
    value: ChartXAxisProperty.COMPLETED_AT,
    label: "Completed date",
  },
  {
    value: ChartXAxisProperty.TARGET_DATE,
    label: "Due date",
  },
  {
    value: ChartXAxisProperty.START_DATE,
    label: "Start date",
  },
  {
    value: ChartXAxisProperty.CREATED_AT,
    label: "Created date",
  },
];

// Pespo: i18n keys for the axis labels above (the labels stay as the English fallback)
export const ANALYTICS_X_AXIS_I18N_KEYS: Partial<Record<ChartXAxisProperty, string>> = {
  [ChartXAxisProperty.STATES]: "chart_axis.state_name",
  [ChartXAxisProperty.STATE_GROUPS]: "chart_axis.state_group",
  [ChartXAxisProperty.PRIORITY]: "chart_axis.priority",
  [ChartXAxisProperty.LABELS]: "chart_axis.label",
  [ChartXAxisProperty.ASSIGNEES]: "chart_axis.assignee",
  [ChartXAxisProperty.ESTIMATE_POINTS]: "chart_axis.estimate_point",
  [ChartXAxisProperty.CYCLES]: "chart_axis.cycle",
  [ChartXAxisProperty.MODULES]: "chart_axis.module",
  [ChartXAxisProperty.COMPLETED_AT]: "chart_axis.completed_date",
  [ChartXAxisProperty.TARGET_DATE]: "chart_axis.due_date",
  [ChartXAxisProperty.START_DATE]: "chart_axis.start_date",
  [ChartXAxisProperty.CREATED_AT]: "chart_axis.created_date",
  [ChartXAxisProperty.CREATED_BY]: "chart_axis.created_by",
};

export const ANALYTICS_Y_AXIS_VALUES: { value: ChartYAxisMetric; label: string }[] = [
  {
    value: ChartYAxisMetric.WORK_ITEM_COUNT,
    label: "Work item",
  },
  {
    value: ChartYAxisMetric.ESTIMATE_POINT_COUNT,
    label: "Estimate",
  },
  {
    value: ChartYAxisMetric.EPIC_WORK_ITEM_COUNT,
    label: "Epic",
  },
];

export const ANALYTICS_Y_AXIS_I18N_KEYS: Partial<Record<ChartYAxisMetric, string>> = {
  [ChartYAxisMetric.WORK_ITEM_COUNT]: "chart_axis.work_item",
  [ChartYAxisMetric.ESTIMATE_POINT_COUNT]: "chart_axis.estimate",
  [ChartYAxisMetric.EPIC_WORK_ITEM_COUNT]: "chart_axis.epic",
};

export const ANALYTICS_V2_DATE_KEYS = ["completed_at", "target_date", "start_date", "created_at"];
