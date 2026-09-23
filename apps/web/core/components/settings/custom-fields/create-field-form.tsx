/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TCustomFieldType } from "@plane/types";
import { CustomSelect, Input } from "@plane/ui";
// hooks
import { useCustomField } from "@/hooks/store/use-custom-field";

const FIELD_TYPE_OPTIONS: { value: TCustomFieldType; i18n_label: string }[] = [
  { value: "text", i18n_label: "project_settings.custom_fields.types.text" },
  { value: "number", i18n_label: "project_settings.custom_fields.types.number" },
  { value: "date", i18n_label: "project_settings.custom_fields.types.date" },
  { value: "checkbox", i18n_label: "project_settings.custom_fields.types.checkbox" },
  { value: "dropdown", i18n_label: "project_settings.custom_fields.types.dropdown" },
  { value: "multi_select", i18n_label: "project_settings.custom_fields.types.multi_select" },
];

type Props = {
  workspaceSlug: string;
  projectId: string;
  onClose: () => void;
};

export function CreateCustomFieldForm(props: Props) {
  const { workspaceSlug, projectId, onClose } = props;
  const { t } = useTranslation();
  const { createCustomField } = useCustomField();
  // state
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<TCustomFieldType>("text");
  const [isRequired, setIsRequired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("project_settings.custom_fields.errors.name_required"),
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await createCustomField(workspaceSlug, projectId, {
        name: name.trim(),
        field_type: fieldType,
        is_required: isRequired,
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("project_settings.custom_fields.created"),
      });
      onClose();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("project_settings.custom_fields.errors.create_failed"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-subtle bg-layer-2 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("project_settings.custom_fields.name_placeholder")}
          className="w-full md:flex-1"
          autoFocus
        />
        <CustomSelect
          value={fieldType}
          label={t(FIELD_TYPE_OPTIONS.find((option) => option.value === fieldType)?.i18n_label ?? "")}
          onChange={(value: TCustomFieldType) => setFieldType(value)}
          buttonClassName="w-full md:w-40"
        >
          {FIELD_TYPE_OPTIONS.map((option) => (
            <CustomSelect.Option key={option.value} value={option.value}>
              {t(option.i18n_label)}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      </div>
      <label className="flex items-center gap-2 text-body-xs-regular text-secondary">
        <input
          type="checkbox"
          checked={isRequired}
          onChange={(e) => setIsRequired(e.target.checked)}
          className="size-4 rounded border-subtle-1"
        />
        {t("project_settings.custom_fields.is_required")}
      </label>
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} loading={isSubmitting}>
          {t("common.add")}
        </Button>
      </div>
    </div>
  );
}
