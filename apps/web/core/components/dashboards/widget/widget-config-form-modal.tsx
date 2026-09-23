/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
// plane package imports
import { useTranslation } from "@plane/i18n";
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
  const { t } = useTranslation();

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
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: t("native_dashboards.widget.updated") });
      } else {
        await createWidget(
          workspaceSlug,
          dashboardId,
          { ...formData, layout: { x: 0, y: 0, w: 4, h: 4 }, sort_order: Date.now() },
          projectId
        );
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: t("native_dashboards.widget.added") });
      }
      onClose();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: error?.error ?? t("common.error.message"),
      });
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose}>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <div className="space-y-5 p-5">
          <h3 className="text-18 font-medium text-secondary">{data ? t("native_dashboards.widget.update") : t("native_dashboards.widget.add")}</h3>
          <div className="space-y-3">
            <div>
              <label htmlFor="name" className="mb-2 block text-secondary">
                {t("native_dashboards.widget.title")}
              </label>
              <Controller
                control={control}
                name="name"
                rules={{ required: t("native_dashboards.widget.title_required") }}
                render={({ field: { value, onChange, ref } }) => (
                  <Input
                    id="name"
                    type="text"
                    value={value ?? ""}
                    onChange={onChange}
                    ref={ref}
                    hasError={Boolean(errors.name)}
                    placeholder={t("native_dashboards.widget.title_placeholder")}
                    className="w-full"
                  />
                )}
              />
            </div>
            <div>
              <div className="mb-2 text-secondary">{t("native_dashboards.widget.chart_type")}</div>
              <Controller
                control={control}
                name="chart_type"
                render={({ field: { value, onChange } }) => (
                  <SelectChartType value={value ?? "bar-chart"} onChange={onChange} />
                )}
              />
            </div>
            <div>
              <div className="mb-2 text-secondary">{t("native_dashboards.widget.group_by")}</div>
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
                {t("native_dashboards.widget.split_by")}
                <span className="block text-10">{t("common.optional")}</span>
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
            {t("common.cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {data ? t("native_dashboards.widget.update") : t("native_dashboards.widget.add")}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
