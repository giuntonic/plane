/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { ICustomFieldOption, TFilterProperty, TSupportedOperators } from "@plane/types";
import { COLLECTION_OPERATOR, EQUALITY_OPERATOR } from "@plane/types";
// local imports
import type { TCreateFilterConfigParams, IFilterIconConfig, TCreateFilterConfig } from "../../../rich-filters";
import { createFilterConfig, getMultiSelectConfig, createOperatorConfigEntry } from "../../../rich-filters";

/**
 * Custom field (dropdown / multi-select) filter specific params
 */
export type TCreateCustomFieldFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<string> & {
    label: string;
    options: ICustomFieldOption[];
  };

/**
 * Helper to get the custom field multi select config
 * @param params - The filter params
 * @returns The custom field option multi select config
 */
export const getCustomFieldMultiSelectConfig = (
  params: TCreateCustomFieldFilterParams,
  singleValueOperator: TSupportedOperators
) =>
  getMultiSelectConfig<ICustomFieldOption, string, string>(
    {
      items: params.options,
      getId: (option) => option.id,
      getLabel: (option) => option.name,
      getValue: (option) => option.id,
    },
    {
      singleValueOperator,
      ...params,
    },
    {
      getOptionIcon: params.getOptionIcon,
    }
  );

/**
 * Get the filter config for a project's dropdown/multi-select custom field.
 * Both types are filtered the same way — "custom field is any of [option, option, ...]" —
 * so they share this one config.
 * @template K - The filter key
 * @param key - The filter key to use, e.g. `custom_field_<uuid>`
 * @returns A function that takes parameters and returns the custom field filter config
 */
export const getCustomFieldFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateCustomFieldFilterParams> =>
  (params: TCreateCustomFieldFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: params.label,
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getCustomFieldMultiSelectConfig(updatedParams, EQUALITY_OPERATOR.EXACT)
        ),
      ]),
    });
