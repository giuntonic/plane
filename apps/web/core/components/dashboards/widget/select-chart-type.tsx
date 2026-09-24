/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AreaChart, BarChart3, Donut, LineChart, PieChart, Radar, ScatterChart } from "lucide-react";
// plane package imports
import { useTranslation } from "@plane/i18n";
import { CustomSelect } from "@plane/ui";
import type { TDashboardChartType } from "@plane/types";

const CHART_TYPE_OPTIONS: { value: TDashboardChartType; i18nKey: string; icon: React.ElementType }[] = [
  { value: "bar-chart", i18nKey: "native_dashboards.chart_types.bar", icon: BarChart3 },
  { value: "line-chart", i18nKey: "native_dashboards.chart_types.line", icon: LineChart },
  { value: "area-chart", i18nKey: "native_dashboards.chart_types.area", icon: AreaChart },
  { value: "pie-chart", i18nKey: "native_dashboards.chart_types.pie", icon: PieChart },
  { value: "donut-chart", i18nKey: "native_dashboards.chart_types.donut", icon: Donut },
  { value: "radar-chart", i18nKey: "native_dashboards.chart_types.radar", icon: Radar },
  { value: "scatter-chart", i18nKey: "native_dashboards.chart_types.scatter", icon: ScatterChart },
];

type Props = {
  value: TDashboardChartType;
  onChange: (value: TDashboardChartType) => void;
};

export function SelectChartType(props: Props) {
  const { value, onChange } = props;
  const { t } = useTranslation();
  const selected = CHART_TYPE_OPTIONS.find((option) => option.value === value);

  return (
    <CustomSelect
      value={value}
      onChange={onChange}
      maxHeight="lg"
      label={
        selected ? (
          <div className="flex items-center gap-2">
            <selected.icon className="size-3.5" />
            {t(selected.i18nKey)}
          </div>
        ) : (
          t("native_dashboards.widget.select_chart_type")
        )
      }
    >
      {CHART_TYPE_OPTIONS.map((option) => (
        <CustomSelect.Option key={option.value} value={option.value}>
          <div className="flex items-center gap-2">
            <option.icon className="size-3.5" />
            {t(option.i18nKey)}
          </div>
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
}
