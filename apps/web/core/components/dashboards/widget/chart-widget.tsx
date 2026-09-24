/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useMemo } from "react";
import { observer } from "mobx-react";
import { useTheme } from "next-themes";
import useSWR from "swr";
// plane package imports
import { useTranslation } from "@plane/i18n";
import { CHART_COLOR_PALETTES } from "@plane/constants";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { DashboardWidgetService } from "@plane/services";
import { Spinner } from "@plane/ui";
import type {
  TAreaItem,
  TBarItem,
  TCellItem,
  TDashboardWidget,
  TLineItem,
  TRadarItem,
  TScatterPointItem,
} from "@plane/types";
// plane web components
import { generateExtendedColors, parseChartData } from "@/components/chart/utils";

const dashboardWidgetService = new DashboardWidgetService();

const BarChart = lazy(() => import("@plane/propel/charts/bar-chart").then((mod) => ({ default: mod.BarChart })));
const LineChart = lazy(() => import("@plane/propel/charts/line-chart").then((mod) => ({ default: mod.LineChart })));
const AreaChart = lazy(() => import("@plane/propel/charts/area-chart").then((mod) => ({ default: mod.AreaChart })));
const PieChart = lazy(() => import("@plane/propel/charts/pie-chart").then((mod) => ({ default: mod.PieChart })));
const RadarChart = lazy(() => import("@plane/propel/charts/radar-chart").then((mod) => ({ default: mod.RadarChart })));
const ScatterChart = lazy(() =>
  import("@plane/propel/charts/scatter-chart").then((mod) => ({ default: mod.ScatterChart }))
);

type Props = {
  widget: TDashboardWidget;
  workspaceSlug: string;
  projectId?: string;
};

export const ChartWidget = observer(function ChartWidget(props: Props) {
  const { widget, workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();

  const { data, isLoading, error } = useSWR(
    `dashboard-widget-chart-${workspaceSlug}-${widget.dashboard}-${widget.id}-${projectId}`,
    () => dashboardWidgetService.getWidgetChartData(workspaceSlug, widget.dashboard, widget.id, projectId)
  );

  const parsedData = useMemo(
    () => data && parseChartData(data, widget.x_axis, widget.group_by, undefined),
    [data, widget.x_axis, widget.group_by]
  );

  const seriesKeys = useMemo(() => {
    if (!parsedData) return [];
    return widget.group_by ? Object.keys(parsedData.schema) : ["count"];
  }, [parsedData, widget.group_by]);

  const seriesLabels = useMemo(
    () =>
      Object.fromEntries(
        seriesKeys.map((key) => [key, widget.group_by ? (parsedData?.schema[key] ?? key) : t("common.count")])
      ),
    [seriesKeys, parsedData, t, widget.group_by]
  );

  const colors = useMemo(() => {
    const baseColors = CHART_COLOR_PALETTES[0]?.[resolvedTheme === "dark" ? "dark" : "light"] ?? [];
    return generateExtendedColors(baseColors, Math.max(seriesKeys.length, parsedData?.data.length ?? 0, 1));
  }, [resolvedTheme, seriesKeys.length, parsedData?.data.length]);

  if (isLoading)
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );

  if (error || !parsedData || parsedData.data.length === 0)
    return (
      <EmptyStateCompact
        assetKey="unknown"
        assetClassName="size-16"
        rootClassName="h-full flex items-center justify-center"
        title={t("native_dashboards.widget.no_data")}
      />
    );

  const xAxis = { key: "name" as const, label: undefined, dy: 20 };
  const yAxis = { key: "count" as const, label: undefined, offset: -40, dx: -20 };
  const margin = { top: 10, right: 20, bottom: 20, left: 0 };

  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      }
    >
      {widget.chart_type === "bar-chart" && (
        <BarChart
          className="h-full w-full"
          data={parsedData.data}
          xAxis={xAxis}
          yAxis={yAxis}
          margin={margin}
          bars={seriesKeys.map<TBarItem<string>>((key, index) => ({
            key,
            label: seriesLabels[key],
            fill: colors[index % colors.length],
            textClassName: "",
            stackId: "bar-one",
            showTopBorderRadius: () => true,
            showBottomBorderRadius: () => true,
          }))}
        />
      )}
      {widget.chart_type === "line-chart" && (
        <LineChart
          className="h-full w-full"
          data={parsedData.data}
          xAxis={xAxis}
          yAxis={yAxis}
          margin={margin}
          lines={seriesKeys.map<TLineItem<string>>((key, index) => ({
            key,
            label: seriesLabels[key],
            stroke: colors[index % colors.length],
            fill: colors[index % colors.length],
            dashedLine: false,
            showDot: true,
            smoothCurves: true,
          }))}
        />
      )}
      {widget.chart_type === "area-chart" && (
        <AreaChart
          className="h-full w-full"
          data={parsedData.data}
          xAxis={xAxis}
          yAxis={yAxis}
          margin={margin}
          areas={seriesKeys.map<TAreaItem<string>>((key, index) => ({
            key,
            label: seriesLabels[key],
            stackId: "area-one",
            fill: colors[index % colors.length],
            fillOpacity: 0.6,
            strokeColor: colors[index % colors.length],
            strokeOpacity: 1,
            showDot: false,
            smoothCurves: true,
          }))}
        />
      )}
      {(widget.chart_type === "pie-chart" || widget.chart_type === "donut-chart") && (
        <PieChart
          className="h-full w-full"
          data={parsedData.data}
          dataKey="count"
          showLabel={false}
          margin={margin}
          innerRadius={widget.chart_type === "donut-chart" ? "60%" : 0}
          cells={parsedData.data.map<TCellItem<string>>((datum, index) => ({
            key: datum.key,
            fill: colors[index % colors.length],
          }))}
        />
      )}
      {widget.chart_type === "radar-chart" && (
        <RadarChart
          className="h-full w-full"
          data={parsedData.data}
          dataKey="key"
          margin={margin}
          angleAxis={{ key: "name" }}
          radars={seriesKeys.map<TRadarItem<string>>((key, index) => ({
            key,
            name: seriesLabels[key],
            fill: colors[index % colors.length],
            stroke: colors[index % colors.length],
            fillOpacity: 0.5,
            dot: { r: 3, fillOpacity: 1 },
          }))}
        />
      )}
      {widget.chart_type === "scatter-chart" && (
        <ScatterChart
          className="h-full w-full"
          data={parsedData.data}
          xAxis={xAxis}
          yAxis={yAxis}
          margin={margin}
          scatterPoints={seriesKeys.map<TScatterPointItem<string>>((key, index) => ({
            key,
            label: seriesLabels[key],
            fill: colors[index % colors.length],
            stroke: colors[index % colors.length],
          }))}
        />
      )}
    </Suspense>
  );
});
