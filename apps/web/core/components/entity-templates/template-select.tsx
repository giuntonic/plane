/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Check, ChevronDown, LayoutTemplate } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TEntityTemplateKind } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
// local imports
import { useEntityTemplates } from "./use-entity-templates";

type Props = {
  workspaceSlug: string;
  kind: TEntityTemplateKind;
  projectId?: string;
  value: string | null;
  onChange: (templateId: string | null) => void;
  disabled?: boolean;
  className?: string;
};

/** Pespo: "Modelo" nos formulários de criação. Some quando não há modelo daquele tipo para o projeto. */
export const EntityTemplateSelect = observer(function EntityTemplateSelect(props: Props) {
  const { workspaceSlug, kind, projectId, value, onChange, disabled = false, className } = props;
  const { t } = useTranslation();
  const { data: templates } = useEntityTemplates(workspaceSlug, kind, projectId);

  if (!templates || templates.length === 0) return null;
  const selected = templates.find((template) => template.id === value);

  return (
    <CustomMenu
      customButton={
        <span
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md border-[0.5px] border-strong px-2 text-body-xs-medium text-secondary hover:bg-layer-1",
            { "border-accent-strong text-accent-primary": !!selected },
            className
          )}
        >
          <LayoutTemplate className="size-3.5 flex-shrink-0" />
          <span className="max-w-40 truncate">{selected?.name ?? t("entity_templates.use_template")}</span>
          <ChevronDown className="size-3 flex-shrink-0" />
        </span>
      }
      ariaLabel={t("entity_templates.use_template")}
      placement="bottom-start"
      disabled={disabled}
      maxHeight="md"
      closeOnSelect
    >
      {selected && (
        <CustomMenu.MenuItem onClick={() => onChange(null)} className="text-tertiary">
          {t("entity_templates.no_template")}
        </CustomMenu.MenuItem>
      )}
      {templates.map((template) => (
        <CustomMenu.MenuItem
          key={template.id}
          onClick={() => onChange(template.id)}
          className="flex items-start justify-between gap-2"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{template.name}</span>
            {template.description && (
              <span className="line-clamp-2 text-caption-sm-regular text-tertiary">{template.description}</span>
            )}
          </span>
          {template.id === value && <Check className="mt-0.5 size-3.5 flex-shrink-0 text-accent-primary" />}
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
});
