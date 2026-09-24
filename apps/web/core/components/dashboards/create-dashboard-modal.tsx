/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
// plane package imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input, ModalCore } from "@plane/ui";
import type { TDashboardCreatePayload, TDashboardScope } from "@plane/types";
// hooks
import { useDashboards } from "@/hooks/store/use-dashboards";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  dashboardType: TDashboardScope;
  projectId?: string;
};

const defaultValues: TDashboardCreatePayload = { name: "", description: "" };

export function CreateDashboardModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, dashboardType, projectId } = props;
  const router = useRouter();
  const { createDashboard } = useDashboards();
  const { t } = useTranslation();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TDashboardCreatePayload>({ defaultValues });

  const onClose = () => {
    reset(defaultValues);
    handleClose();
  };

  const handleFormSubmit = async (formData: TDashboardCreatePayload) => {
    try {
      const dashboard = await createDashboard(workspaceSlug, { ...formData, dashboard_type: dashboardType }, projectId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: t("native_dashboards.created") });
      onClose();
      const basePath = projectId
        ? `/${workspaceSlug}/projects/${projectId}/dashboards`
        : dashboardType === "home"
          ? `/${workspaceSlug}/my-dashboards`
          : `/${workspaceSlug}/dashboards`;
      router.push(`${basePath}/${dashboard.id}/`);
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
          <h3 className="text-18 font-medium text-secondary">{t("native_dashboards.new")}</h3>
          <div>
            <label htmlFor="name" className="mb-2 block text-secondary">
              {t("common.name")}
            </label>
            <Controller
              control={control}
              name="name"
              rules={{ required: t("native_dashboards.name_required") }}
              render={({ field: { value, onChange, ref } }) => (
                <Input
                  id="name"
                  type="text"
                  value={value ?? ""}
                  onChange={onChange}
                  ref={ref}
                  hasError={Boolean(errors.name)}
                  placeholder={t("native_dashboards.name_placeholder")}
                  className="w-full"
                />
              )}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {t("native_dashboards.create")}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
