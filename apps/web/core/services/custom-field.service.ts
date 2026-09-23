/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable no-useless-catch */

// types
import { API_BASE_URL } from "@plane/constants";
import type {
  ICustomField,
  ICustomFieldOption,
  IIssueCustomFieldValue,
  TCustomFieldFormData,
  TIssueCustomFieldValueFormData,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class CustomFieldService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchProjectCustomFields(workspaceSlug: string, projectId: string): Promise<ICustomField[]> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/custom-fields/`);
      return data;
    } catch (error) {
      throw error;
    }
  }

  async createCustomField(
    workspaceSlug: string,
    projectId: string,
    payload: TCustomFieldFormData
  ): Promise<ICustomField> {
    try {
      const { data } = await this.post(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/custom-fields/`,
        payload
      );
      return data;
    } catch (error) {
      throw error;
    }
  }

  async updateCustomField(
    workspaceSlug: string,
    projectId: string,
    customFieldId: string,
    payload: TCustomFieldFormData
  ): Promise<ICustomField> {
    try {
      const { data } = await this.patch(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/custom-fields/${customFieldId}/`,
        payload
      );
      return data;
    } catch (error) {
      throw error;
    }
  }

  async deleteCustomField(workspaceSlug: string, projectId: string, customFieldId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/custom-fields/${customFieldId}/`);
    } catch (error) {
      throw error;
    }
  }

  async createCustomFieldOption(
    workspaceSlug: string,
    projectId: string,
    customFieldId: string,
    payload: Partial<Pick<ICustomFieldOption, "name" | "sort_order">>
  ): Promise<ICustomFieldOption> {
    try {
      const { data } = await this.post(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/custom-fields/${customFieldId}/options/`,
        payload
      );
      return data;
    } catch (error) {
      throw error;
    }
  }

  async updateCustomFieldOption(
    workspaceSlug: string,
    projectId: string,
    customFieldId: string,
    optionId: string,
    payload: Partial<Pick<ICustomFieldOption, "name" | "sort_order">>
  ): Promise<ICustomFieldOption> {
    try {
      const { data } = await this.patch(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/custom-fields/${customFieldId}/options/${optionId}/`,
        payload
      );
      return data;
    } catch (error) {
      throw error;
    }
  }

  async deleteCustomFieldOption(
    workspaceSlug: string,
    projectId: string,
    customFieldId: string,
    optionId: string
  ): Promise<void> {
    try {
      await this.delete(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/custom-fields/${customFieldId}/options/${optionId}/`
      );
    } catch (error) {
      throw error;
    }
  }

  async fetchIssueCustomFieldValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<IIssueCustomFieldValue[]> {
    try {
      const { data } = await this.get(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/custom-field-values/`
      );
      return data;
    } catch (error) {
      throw error;
    }
  }

  async updateIssueCustomFieldValue(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    customFieldId: string,
    payload: TIssueCustomFieldValueFormData
  ): Promise<IIssueCustomFieldValue> {
    try {
      const { data } = await this.patch(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/custom-field-values/${customFieldId}/`,
        payload
      );
      return data;
    } catch (error) {
      throw error;
    }
  }
}

const customFieldService = new CustomFieldService();

export default customFieldService;
