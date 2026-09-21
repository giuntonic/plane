/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ICustomField } from "@plane/types";
// hooks
import { useCustomField } from "@/hooks/store/use-custom-field";
// local imports
import { CustomFieldOptionsEditor } from "./field-options";

const FIELD_TYPE_I18N_LABEL: Record<ICustomField["field_type"], string> = {
  text: "project_settings.custom_fields.types.text",
  number: "project_settings.custom_fields.types.number",
  date: "project_settings.custom_fields.types.date",
  checkbox: "project_settings.custom_fields.types.checkbox",
  dropdown: "project_settings.custom_fields.types.dropdown",
  multi_select: "project_settings.custom_fields.types.multi_select",
};

const FIELD_TYPES_WITH_OPTIONS: ICustomField["field_type"][] = ["dropdown", "multi_select"];

type Props = {
  workspaceSlug: string;
  projectId: string;
  customField: ICustomField;
};

export const CustomFieldRow = observer(function CustomFieldRow(props: Props) {
  const { workspaceSlug, projectId, customField } = props;
  const { t } = useTranslation();
  const { deleteCustomField } = useCustomField();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteCustomField(workspaceSlug, projectId, customField.id);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("project_settings.custom_fields.errors.delete_failed"),
      });
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex w-full flex-col rounded-lg border border-subtle bg-layer-2 px-4 py-3">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <GripVertical className="size-4 shrink-0 cursor-grab text-tertiary" />
          <span className="truncate text-body-sm-medium text-primary">{customField.name}</span>
          <span className="shrink-0 rounded-full bg-layer-3 px-2 py-0.5 text-caption-md-regular text-tertiary">
            {t(FIELD_TYPE_I18N_LABEL[customField.field_type])}
          </span>
          {customField.is_required && (
            <span className="shrink-0 rounded-full bg-layer-3 px-2 py-0.5 text-caption-md-regular text-tertiary">
              {t("project_settings.custom_fields.required_badge")}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="shrink-0 text-tertiary hover:text-danger-secondary disabled:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      {FIELD_TYPES_WITH_OPTIONS.includes(customField.field_type) && (
        <CustomFieldOptionsEditor workspaceSlug={workspaceSlug} projectId={projectId} customField={customField} />
      )}
    </div>
  );
});
