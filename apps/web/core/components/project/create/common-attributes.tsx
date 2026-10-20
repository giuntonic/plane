/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ChangeEvent } from "react";
import type { UseFormSetValue } from "react-hook-form";
import { Controller, useFormContext } from "react-hook-form";
// plane imports
import { ETabIndices, PROJECT_IDENTIFIER_MAX_LENGTH } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProject } from "@plane/types";
// ui
import { Input, TextArea } from "@plane/ui";
import { projectIdentifierSanitizer, getTabIndex } from "@plane/utils";

type Props = {
  setValue: UseFormSetValue<TProject>;
  isMobile: boolean;
  shouldAutoSyncIdentifier: boolean;
  setShouldAutoSyncIdentifier: (value: boolean) => void;
  handleFormOnChange?: () => void;
};

function ProjectCommonAttributes(props: Props) {
  const { setValue, isMobile, handleFormOnChange } = props;
  const {
    formState: { errors },
    control,
  } = useFormContext<TProject>();

  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CREATE, isMobile);
  const { t } = useTranslation();

  // Pespo: o identificador do projeto não aparece mais no formulário; ele é sempre gerado a partir do
  // nome (o backend acrescenta um número se já existir outro igual no workspace).
  const handleNameChange =
    (onChange: (event: ChangeEvent<HTMLInputElement>) => void) => (e: ChangeEvent<HTMLInputElement>) => {
      const sanitizedIdentifier = projectIdentifierSanitizer(e.target.value).substring(
        0,
        PROJECT_IDENTIFIER_MAX_LENGTH
      );
      setValue("identifier", sanitizedIdentifier || "PROJ");
      onChange(e);
      handleFormOnChange?.();
    };

  return (
    <div className="grid grid-cols-1 gap-x-2 gap-y-3 md:grid-cols-4">
      <div className="md:col-span-4">
        <Controller
          control={control}
          name="name"
          rules={{
            required: t("name_is_required"),
            maxLength: {
              value: 255,
              message: t("title_should_be_less_than_255_characters"),
            },
          }}
          render={({ field: { value, onChange } }) => (
            <Input
              id="name"
              name="name"
              type="text"
              value={value}
              onChange={handleNameChange(onChange)}
              hasError={Boolean(errors.name)}
              placeholder={t("project_name")}
              className="focus:border-blue-400 w-full"
              tabIndex={getIndex("name")}
            />
          )}
        />
        <span className="text-11 text-danger-primary">{errors?.name?.message}</span>
      </div>
      <div className="md:col-span-4">
        <Controller
          name="description"
          control={control}
          render={({ field: { value, onChange } }) => (
            <TextArea
              id="description"
              name="description"
              value={value}
              placeholder={t("description")}
              onChange={(e) => {
                onChange(e);
                handleFormOnChange?.();
              }}
              className="focus:border-blue-400 !h-24 text-13"
              hasError={Boolean(errors?.description)}
              tabIndex={getIndex("description")}
            />
          )}
        />
      </div>
    </div>
  );
}

export default ProjectCommonAttributes;
