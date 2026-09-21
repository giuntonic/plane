/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, sortBy } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type {
  ICustomField,
  ICustomFieldOption,
  IIssueCustomFieldValue,
  TCustomFieldFormData,
  TIssueCustomFieldValueFormData,
} from "@plane/types";
// services
import { CustomFieldService } from "@/services/custom-field.service";
// store
import type { CoreRootStore } from "./root.store";

export interface ICustomFieldStore {
  // observables
  fieldMap: Record<string, ICustomField>;
  fetchedMap: Record<string, boolean>;
  issueValueMap: Record<string, Record<string, IIssueCustomFieldValue>>;
  issueValueFetchedMap: Record<string, boolean>;
  // computed actions
  getProjectCustomFields: (projectId: string | undefined | null) => ICustomField[] | undefined;
  getCustomFieldById: (customFieldId: string) => ICustomField | undefined;
  getIssueCustomFieldValues: (issueId: string | undefined | null) => IIssueCustomFieldValue[] | undefined;
  getIssueCustomFieldValue: (
    issueId: string | undefined | null,
    customFieldId: string
  ) => IIssueCustomFieldValue | undefined;
  // fetch actions
  fetchProjectCustomFields: (workspaceSlug: string, projectId: string) => Promise<ICustomField[]>;
  fetchIssueCustomFieldValues: (
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ) => Promise<IIssueCustomFieldValue[]>;
  // crud actions
  createCustomField: (
    workspaceSlug: string,
    projectId: string,
    data: TCustomFieldFormData
  ) => Promise<ICustomField>;
  updateCustomField: (
    workspaceSlug: string,
    projectId: string,
    customFieldId: string,
    data: TCustomFieldFormData
  ) => Promise<ICustomField>;
  deleteCustomField: (workspaceSlug: string, projectId: string, customFieldId: string) => Promise<void>;
  updateCustomFieldPosition: (
    workspaceSlug: string,
    projectId: string,
    orderedFields: ICustomField[],
    movedFieldId: string
  ) => Promise<void>;
  createCustomFieldOption: (
    workspaceSlug: string,
    projectId: string,
    customFieldId: string,
    data: Partial<Pick<ICustomFieldOption, "name" | "sort_order">>
  ) => Promise<ICustomFieldOption>;
  deleteCustomFieldOption: (
    workspaceSlug: string,
    projectId: string,
    customFieldId: string,
    optionId: string
  ) => Promise<void>;
  updateIssueCustomFieldValue: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    customFieldId: string,
    data: TIssueCustomFieldValueFormData
  ) => Promise<IIssueCustomFieldValue>;
}

export class CustomFieldStore implements ICustomFieldStore {
  // root store
  rootStore;
  // observables
  fieldMap: Record<string, ICustomField> = {};
  fetchedMap: Record<string, boolean> = {};
  issueValueMap: Record<string, Record<string, IIssueCustomFieldValue>> = {};
  issueValueFetchedMap: Record<string, boolean> = {};
  // service
  customFieldService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      fieldMap: observable,
      fetchedMap: observable,
      issueValueMap: observable,
      issueValueFetchedMap: observable,
      // actions
      fetchProjectCustomFields: action,
      createCustomField: action,
      updateCustomField: action,
      deleteCustomField: action,
      updateCustomFieldPosition: action,
      createCustomFieldOption: action,
      deleteCustomFieldOption: action,
      fetchIssueCustomFieldValues: action,
      updateIssueCustomFieldValue: action,
    });

    this.rootStore = _rootStore;
    this.customFieldService = new CustomFieldService();
  }

  /**
   * Returns the custom fields defined for a project, ordered by sort_order
   */
  getProjectCustomFields = computedFn((projectId: string | undefined | null) => {
    if (!projectId || !this.fetchedMap[projectId]) return undefined;
    return sortBy(
      Object.values(this.fieldMap).filter((field) => field.project === projectId),
      "sort_order"
    );
  });

  /**
   * Returns a single custom field definition by id
   */
  getCustomFieldById = computedFn((customFieldId: string): ICustomField | undefined => this.fieldMap[customFieldId]);

  /**
   * Returns every custom field value set on an issue
   */
  getIssueCustomFieldValues = computedFn((issueId: string | undefined | null) => {
    if (!issueId || !this.issueValueFetchedMap[issueId]) return undefined;
    return Object.values(this.issueValueMap[issueId] ?? {});
  });

  /**
   * Returns the value of a single custom field on an issue
   */
  getIssueCustomFieldValue = computedFn(
    (issueId: string | undefined | null, customFieldId: string): IIssueCustomFieldValue | undefined => {
      if (!issueId) return undefined;
      return this.issueValueMap[issueId]?.[customFieldId];
    }
  );

  /**
   * Fetches all custom fields defined for a project
   */
  fetchProjectCustomFields = async (workspaceSlug: string, projectId: string) =>
    await this.customFieldService.fetchProjectCustomFields(workspaceSlug, projectId).then((response) => {
      runInAction(() => {
        response.forEach((field) => {
          set(this.fieldMap, [field.id], field);
        });
        set(this.fetchedMap, projectId, true);
      });
      return response;
    });

  /**
   * Fetches the custom field values set on a single issue
   */
  fetchIssueCustomFieldValues = async (workspaceSlug: string, projectId: string, issueId: string) =>
    await this.customFieldService.fetchIssueCustomFieldValues(workspaceSlug, projectId, issueId).then((response) => {
      runInAction(() => {
        response.forEach((value) => {
          set(this.issueValueMap, [issueId, value.custom_field], value);
        });
        set(this.issueValueFetchedMap, issueId, true);
      });
      return response;
    });

  /**
   * Creates a new custom field for a project
   */
  createCustomField = async (workspaceSlug: string, projectId: string, data: TCustomFieldFormData) =>
    await this.customFieldService.createCustomField(workspaceSlug, projectId, data).then((response) => {
      runInAction(() => {
        set(this.fieldMap, [response.id], response);
      });
      return response;
    });

  /**
   * Updates an existing custom field definition
   */
  updateCustomField = async (
    workspaceSlug: string,
    projectId: string,
    customFieldId: string,
    data: TCustomFieldFormData
  ) => {
    const originalField = this.fieldMap[customFieldId];
    try {
      runInAction(() => {
        set(this.fieldMap, [customFieldId], { ...originalField, ...data });
      });
      return await this.customFieldService.updateCustomField(workspaceSlug, projectId, customFieldId, data);
    } catch (error) {
      runInAction(() => {
        set(this.fieldMap, [customFieldId], originalField);
      });
      throw error;
    }
  };

  /**
   * Deletes a custom field and removes it from the store
   */
  deleteCustomField = async (workspaceSlug: string, projectId: string, customFieldId: string) => {
    if (!this.fieldMap[customFieldId]) return;
    await this.customFieldService.deleteCustomField(workspaceSlug, projectId, customFieldId).then(() => {
      runInAction(() => {
        delete this.fieldMap[customFieldId];
      });
    });
  };

  /**
   * Reorders a custom field within a project by recomputing its sort_order
   * relative to its new neighbors and persisting the change
   */
  updateCustomFieldPosition = async (
    workspaceSlug: string,
    projectId: string,
    orderedFields: ICustomField[],
    movedFieldId: string
  ) => {
    const movedIndex = orderedFields.findIndex((field) => field.id === movedFieldId);
    if (movedIndex === -1) return;

    const prevSortOrder = orderedFields[movedIndex - 1]?.sort_order;
    const nextSortOrder = orderedFields[movedIndex + 1]?.sort_order;

    let sortOrder = 65535;
    if (prevSortOrder !== undefined && nextSortOrder !== undefined) {
      sortOrder = (prevSortOrder + nextSortOrder) / 2;
    } else if (nextSortOrder !== undefined) {
      sortOrder = nextSortOrder / 2;
    } else if (prevSortOrder !== undefined) {
      sortOrder = prevSortOrder + 10000;
    }

    await this.updateCustomField(workspaceSlug, projectId, movedFieldId, { sort_order: sortOrder });
  };

  /**
   * Adds a dropdown option to a custom field
   */
  createCustomFieldOption = async (
    workspaceSlug: string,
    projectId: string,
    customFieldId: string,
    data: Partial<Pick<ICustomFieldOption, "name" | "sort_order">>
  ) =>
    await this.customFieldService.createCustomFieldOption(workspaceSlug, projectId, customFieldId, data).then(
      (response) => {
        runInAction(() => {
          const field = this.fieldMap[customFieldId];
          if (field) set(this.fieldMap, [customFieldId, "options"], [...(field.options ?? []), response]);
        });
        return response;
      }
    );

  /**
   * Removes a dropdown option from a custom field
   */
  deleteCustomFieldOption = async (
    workspaceSlug: string,
    projectId: string,
    customFieldId: string,
    optionId: string
  ) => {
    await this.customFieldService.deleteCustomFieldOption(workspaceSlug, projectId, customFieldId, optionId).then(
      () => {
        runInAction(() => {
          const field = this.fieldMap[customFieldId];
          if (field)
            set(
              this.fieldMap,
              [customFieldId, "options"],
              (field.options ?? []).filter((option) => option.id !== optionId)
            );
        });
      }
    );
  };

  /**
   * Creates or updates the value of a custom field on an issue
   */
  updateIssueCustomFieldValue = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    customFieldId: string,
    data: TIssueCustomFieldValueFormData
  ) => {
    const originalValue = this.issueValueMap[issueId]?.[customFieldId];
    try {
      const response = await this.customFieldService.updateIssueCustomFieldValue(
        workspaceSlug,
        projectId,
        issueId,
        customFieldId,
        data
      );
      runInAction(() => {
        set(this.issueValueMap, [issueId, customFieldId], response);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        if (originalValue) set(this.issueValueMap, [issueId, customFieldId], originalValue);
      });
      throw error;
    }
  };
}
