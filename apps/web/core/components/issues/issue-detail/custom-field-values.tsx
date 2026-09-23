/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { ListChecks } from "lucide-react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import type { ICustomField, IIssueCustomFieldValue } from "@plane/types";
import { CustomSelect, Input } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
// hooks
import { useCustomField } from "@/hooks/store/use-custom-field";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

export const IssueCustomFieldValuesList = observer(function IssueCustomFieldValuesList(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const { getProjectCustomFields, fetchProjectCustomFields, fetchIssueCustomFieldValues } = useCustomField();

  useSWR(
    workspaceSlug && projectId ? `PROJECT_CUSTOM_FIELDS_${workspaceSlug}_${projectId}` : null,
    () => fetchProjectCustomFields(workspaceSlug, projectId)
  );
  useSWR(
    workspaceSlug && projectId && issueId ? `ISSUE_CUSTOM_FIELD_VALUES_${issueId}` : null,
    () => fetchIssueCustomFieldValues(workspaceSlug, projectId, issueId)
  );

  const customFields = getProjectCustomFields(projectId);

  if (!customFields || customFields.length === 0) return null;

  return (
    <>
      {customFields.map((field) => (
        <SidebarPropertyListItem key={field.id} icon={ListChecks} label={field.name}>
          <CustomFieldValueInput
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueId={issueId}
            customField={field}
            disabled={disabled}
          />
        </SidebarPropertyListItem>
      ))}
    </>
  );
});

type TValueProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  customField: ICustomField;
  disabled: boolean;
};

const CustomFieldValueInput = observer(function CustomFieldValueInput(props: TValueProps) {
  const { workspaceSlug, projectId, issueId, customField, disabled } = props;
  const { getIssueCustomFieldValue, updateIssueCustomFieldValue } = useCustomField();
  const value = getIssueCustomFieldValue(issueId, customField.id);
  const [localText, setLocalText] = useState<string | undefined>(undefined);

  const handleUpdate = (payload: Partial<IIssueCustomFieldValue>) =>
    updateIssueCustomFieldValue(workspaceSlug, projectId, issueId, customField.id, payload);

  if (customField.field_type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={value?.boolean_value ?? false}
        disabled={disabled}
        onChange={(e) => handleUpdate({ boolean_value: e.target.checked })}
        className="size-4 rounded border-subtle-1"
      />
    );
  }

  if (customField.field_type === "date") {
    return (
      <input
        type="date"
        value={value?.date_value ?? ""}
        disabled={disabled}
        onChange={(e) => handleUpdate({ date_value: e.target.value || null })}
        className="w-full bg-transparent text-body-xs-regular text-primary outline-none"
      />
    );
  }

  if (customField.field_type === "dropdown") {
    const selectedOption = customField.options?.find((option) => option.id === value?.option);
    return (
      <CustomSelect
        value={value?.option ?? null}
        label={selectedOption?.name ?? "-"}
        onChange={(optionId: string) => handleUpdate({ option: optionId })}
        disabled={disabled}
        buttonClassName="w-full border-none px-2 py-0.5"
      >
        {customField.options?.map((option) => (
          <CustomSelect.Option key={option.id} value={option.id}>
            {option.name}
          </CustomSelect.Option>
        ))}
      </CustomSelect>
    );
  }

  if (customField.field_type === "multi_select") {
    const selectedOptionIds = value?.multi_select_options ?? [];
    const toggleOption = (optionId: string) => {
      const nextOptionIds = selectedOptionIds.includes(optionId)
        ? selectedOptionIds.filter((id) => id !== optionId)
        : [...selectedOptionIds, optionId];
      handleUpdate({ multi_select_options: nextOptionIds });
    };
    return (
      <div className="flex flex-wrap items-center gap-1">
        {customField.options?.map((option) => {
          const isSelected = selectedOptionIds.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => toggleOption(option.id)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-caption-md-regular disabled:opacity-60",
                isSelected
                  ? "border-accent-strong bg-accent-primary/10 text-accent-primary"
                  : "border-subtle-1 text-tertiary hover:text-secondary"
              )}
            >
              {option.name}
            </button>
          );
        })}
        {(!customField.options || customField.options.length === 0) && (
          <span className="text-body-xs-regular text-placeholder">-</span>
        )}
      </div>
    );
  }

  if (customField.field_type === "number") {
    return (
      <Input
        type="number"
        defaultValue={value?.number_value ?? ""}
        disabled={disabled}
        onBlur={(e) => handleUpdate({ number_value: e.target.value === "" ? null : Number(e.target.value) })}
        mode="transparent"
        inputSize="xs"
        className="w-full"
      />
    );
  }

  return (
    <Input
      type="text"
      value={localText ?? value?.text_value ?? ""}
      disabled={disabled}
      onChange={(e) => setLocalText(e.target.value)}
      onBlur={(e) => {
        setLocalText(undefined);
        handleUpdate({ text_value: e.target.value || null });
      }}
      mode="transparent"
      inputSize="xs"
      className="w-full"
    />
  );
});
