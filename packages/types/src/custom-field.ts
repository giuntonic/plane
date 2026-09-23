/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TCustomFieldType = "text" | "number" | "date" | "checkbox" | "dropdown" | "multi_select";

export interface ICustomFieldOption {
  id: string;
  name: string;
  sort_order: number;
  custom_field: string;
  workspace: string;
  project: string;
}

export interface ICustomField {
  id: string;
  name: string;
  description: string;
  field_type: TCustomFieldType;
  is_required: boolean;
  sort_order: number;
  options: ICustomFieldOption[];
  workspace: string;
  project: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type TCustomFieldFormData = Partial<
  Pick<ICustomField, "name" | "description" | "field_type" | "is_required" | "sort_order">
>;

export interface IIssueCustomFieldValue {
  id: string;
  issue: string;
  custom_field: string;
  text_value: string | null;
  number_value: number | null;
  date_value: string | null;
  boolean_value: boolean | null;
  option: string | null;
  multi_select_options: string[];
  workspace: string;
  project: string;
}

export type TIssueCustomFieldValueFormData = Partial<
  Pick<
    IIssueCustomFieldValue,
    "text_value" | "number_value" | "date_value" | "boolean_value" | "option" | "multi_select_options"
  >
>;
