/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AreaChart, BarChart3, Donut, LineChart, PieChart, Radar, ScatterChart } from "lucide-react";
// plane package imports
import { CustomSelect } from "@plane/ui";
import type { TDashboardChartType } from "@plane/types";

const CHART_TYPE_OPTIONS: { value: TDashboardChartType; label: string; icon: React.ElementType }[] = [
  { value: "bar-chart", label: "Bar chart", icon: BarChart3 },
  { value: "line-chart", label: "Line chart", icon: LineChart },
  { value: "area-chart", label: "Area chart", icon: AreaChart },
  { value: "pie-chart", label: "Pie chart", icon: PieChart },
  { value: "donut-chart", label: "Donut chart", icon: Donut },
  { value: "radar-chart", label: "Radar chart", icon: Radar },
  { value: "scatter-chart", label: "Scatter chart", icon: ScatterChart },
];

type Props = {
  value: TDashboardChartType;
  onChange: (value: TDashboardChartType) => void;
};

export function SelectChartType(props: Props) {
  const { value, onChange } = props;
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
            {selected.label}
          </div>
        ) : (
          "Select chart type"
        )
      }
    >
      {CHART_TYPE_OPTIONS.map((option) => (
        <CustomSelect.Option key={option.value} value={option.value}>
          <div className="flex items-center gap-2">
            <option.icon className="size-3.5" />
            {option.label}
          </div>
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
}
