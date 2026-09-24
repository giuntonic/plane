/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Control } from "react-hook-form";
import { Controller } from "react-hook-form";
import { useTranslation } from "@plane/i18n";
import type { IWebhook } from "@plane/types";
import { Checkbox } from "@plane/ui";

const INDIVIDUAL_WEBHOOK_OPTION_KEYS: {
  key: keyof IWebhook;
  i18n_key: string;
}[] = [
  { key: "project", i18n_key: "project" },
  { key: "cycle", i18n_key: "cycle" },
  { key: "issue", i18n_key: "issue" },
  { key: "module", i18n_key: "module" },
  { key: "issue_comment", i18n_key: "issue_comment" },
];

type Props = {
  control: Control<IWebhook, any>;
};

export function WebhookIndividualEventOptions({ control }: Props) {
  const { t } = useTranslation();
  const individualWebhookOptions = INDIVIDUAL_WEBHOOK_OPTION_KEYS.map((option) => ({
    key: option.key,
    label: t(`workspace_settings.settings.webhooks.events.${option.i18n_key}.label`),
    description: t(`workspace_settings.settings.webhooks.events.${option.i18n_key}.description`),
  }));

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-8 px-6 lg:grid-cols-2">
      {individualWebhookOptions.map((option) => (
        <Controller
          key={option.key}
          control={control}
          name={option.key}
          render={({ field: { onChange, value } }) => (
            <div>
              <div className="flex items-center gap-2">
                <Checkbox id={option.key} onChange={() => onChange(!value)} checked={value === true} />
                <label className="text-13" htmlFor={option.key}>
                  {option.label}
                </label>
              </div>
              <p className="mt-0.5 ml-6 text-11 text-tertiary">{option.description}</p>
            </div>
          )}
        />
      ))}
    </div>
  );
}
