/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
// components
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useCustomField } from "@/hooks/store/use-custom-field";
// local imports
import { CreateCustomFieldForm } from "./create-field-form";
import { CustomFieldRow } from "./field-row";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
};

export const CustomFieldsRoot = observer(function CustomFieldsRoot(props: Props) {
  const { workspaceSlug, projectId, isAdmin } = props;
  const { t } = useTranslation();
  const { getProjectCustomFields, fetchProjectCustomFields } = useCustomField();
  const [isCreating, setIsCreating] = useState(false);

  useSWR(
    workspaceSlug && projectId ? `PROJECT_CUSTOM_FIELDS_${workspaceSlug}_${projectId}` : null,
    () => fetchProjectCustomFields(workspaceSlug, projectId)
  );

  const customFields = getProjectCustomFields(projectId);

  return (
    <div className="flex flex-col gap-4">
      <SettingsHeading
        title={t("project_settings.custom_fields.heading")}
        description={t("project_settings.custom_fields.description")}
        control={
          isAdmin &&
          !isCreating && (
            <Button variant="secondary" size="sm" prependIcon={<Plus />} onClick={() => setIsCreating(true)}>
              {t("project_settings.custom_fields.add_field")}
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-3">
        {isCreating && (
          <CreateCustomFieldForm
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            onClose={() => setIsCreating(false)}
          />
        )}
        {customFields?.map((field) => (
          <CustomFieldRow key={field.id} workspaceSlug={workspaceSlug} projectId={projectId} customField={field} />
        ))}
        {customFields?.length === 0 && !isCreating && (
          <p className="text-body-xs-regular text-tertiary">{t("project_settings.custom_fields.empty_state")}</p>
        )}
      </div>
    </div>
  );
});
