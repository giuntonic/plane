/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
// plane package imports
import { ANALYTICS_X_AXIS_VALUES } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input, ModalCore } from "@plane/ui";
import { ChartXAxisProperty } from "@plane/types";
import type { TDashboardWidget, TDashboardWidgetCreatePayload } from "@plane/types";
// hooks
import { useDashboards } from "@/hooks/store/use-dashboards";
// plane web components
import { SelectXAxis } from "@/components/analytics/select/select-x-axis";
import { SelectChartType } from "./select-chart-type";

const X_AXIS_OPTIONS = [...ANALYTICS_X_AXIS_VALUES, { value: ChartXAxisProperty.CREATED_BY, label: "Created by" }];

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  dashboardId: string;
  projectId?: string;
  data?: TDashboardWidget | null;
};

const defaultValues: TDashboardWidgetCreatePayload = {
  name: "",
  chart_type: "bar-chart",
  x_axis: ChartXAxisProperty.STATE_GROUPS,
  group_by: null,
};

export function WidgetConfigFormModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, dashboardId, projectId, data } = props;
  const { createWidget, updateWidget } = useDashboards();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TDashboardWidgetCreatePayload>({ defaultValues });

  useEffect(() => {
    reset({
      ...defaultValues,
      ...data,
    });
  }, [data, isOpen, reset]);

  const onClose = () => handleClose();

  const handleFormSubmit = async (formData: TDashboardWidgetCreatePayload) => {
    try {
      if (data) {
        await updateWidget(workspaceSlug, dashboardId, data.id, formData, projectId);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Widget updated successfully." });
      } else {
        await createWidget(
          workspaceSlug,
          dashboardId,
          { ...formData, layout: { x: 0, y: 0, w: 4, h: 4 }, sort_order: Date.now() },
          projectId
        );
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Widget added successfully." });
      }
      onClose();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error?.error ?? "Some error occurred. Please try again.",
      });
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose}>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <div className="space-y-5 p-5">
          <h3 className="text-18 font-medium text-secondary">{data ? "Update" : "Add"} widget</h3>
          <div className="space-y-3">
            <div>
              <label htmlFor="name" className="mb-2 block text-secondary">
                Title
              </label>
              <Controller
                control={control}
                name="name"
                rules={{ required: "Title is required" }}
                render={({ field: { value, onChange, ref } }) => (
                  <Input
                    id="name"
                    type="text"
                    value={value ?? ""}
                    onChange={onChange}
                    ref={ref}
                    hasError={Boolean(errors.name)}
                    placeholder="e.g. Work items by state"
                    className="w-full"
                  />
                )}
              />
            </div>
            <div>
              <div className="mb-2 text-secondary">Chart type</div>
              <Controller
                control={control}
                name="chart_type"
                render={({ field: { value, onChange } }) => (
                  <SelectChartType value={value ?? "bar-chart"} onChange={onChange} />
                )}
              />
            </div>
            <div>
              <div className="mb-2 text-secondary">Group work items by</div>
              <Controller
                control={control}
                name="x_axis"
                render={({ field: { value, onChange } }) => (
                  <SelectXAxis value={value ?? undefined} onChange={(val) => onChange(val)} options={X_AXIS_OPTIONS} />
                )}
              />
            </div>
            <div>
              <div className="mb-2 text-secondary">
                Split by
                <span className="block text-10">Optional</span>
              </div>
              <Controller
                control={control}
                name="group_by"
                render={({ field: { value, onChange } }) => (
                  <SelectXAxis
                    value={value ?? undefined}
                    onChange={(val) => onChange(val)}
                    options={X_AXIS_OPTIONS}
                    allowNoValue
                  />
                )}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {data ? "Update widget" : "Add widget"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
