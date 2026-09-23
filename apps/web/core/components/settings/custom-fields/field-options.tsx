/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ICustomField } from "@plane/types";
import { Input } from "@plane/ui";
// hooks
import { useCustomField } from "@/hooks/store/use-custom-field";

type Props = {
  workspaceSlug: string;
  projectId: string;
  customField: ICustomField;
};

export function CustomFieldOptionsEditor(props: Props) {
  const { workspaceSlug, projectId, customField } = props;
  const { t } = useTranslation();
  const { createCustomFieldOption, deleteCustomFieldOption } = useCustomField();
  const [newOption, setNewOption] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleAddOption = async () => {
    if (!newOption.trim()) return;
    setIsAdding(true);
    try {
      await createCustomFieldOption(workspaceSlug, projectId, customField.id, { name: newOption.trim() });
      setNewOption("");
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("project_settings.custom_fields.errors.option_create_failed"),
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteOption = async (optionId: string) => {
    try {
      await deleteCustomFieldOption(workspaceSlug, projectId, customField.id, optionId);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("project_settings.custom_fields.errors.option_delete_failed"),
      });
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-subtle pt-2 pl-4">
      {customField.options?.map((option) => (
        <div key={option.id} className="flex items-center justify-between gap-2 text-body-xs-regular text-secondary">
          <span>{option.name}</span>
          <button
            type="button"
            onClick={() => handleDeleteOption(option.id)}
            className="text-tertiary hover:text-secondary"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddOption();
          }}
          placeholder={t("project_settings.custom_fields.add_option_placeholder")}
          inputSize="xs"
          className="w-48"
          disabled={isAdding}
        />
      </div>
    </div>
  );
}
