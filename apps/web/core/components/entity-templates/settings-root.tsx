/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Globe, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TEntityTemplate, TEntityTemplateKind } from "@plane/types";
import { AlertModalCore, CustomMenu, Input, ModalCore, TextArea } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
// services
import { entityTemplateService } from "@/services/entity-template.service";
// local imports
import { revalidateEntityTemplates, useEntityTemplates } from "./use-entity-templates";

const KIND_ORDER: TEntityTemplateKind[] = ["project", "work_item", "module", "cycle", "page"];

function EditTemplateModal(props: { workspaceSlug: string; template: TEntityTemplate; onClose: () => void }) {
  const { workspaceSlug, template, onClose } = props;
  const { t } = useTranslation();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      await entityTemplateService.update(workspaceSlug, template.id, { name: name.trim(), description });
      void revalidateEntityTemplates(workspaceSlug);
      onClose();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("entity_templates.save_error") });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalCore isOpen handleClose={onClose}>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className="space-y-4 p-5">
          <h3 className="text-18 font-medium text-secondary">{t("entity_templates.edit")}</h3>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full"
            maxLength={255}
            // oxlint-disable-next-line jsx_a11y/no-autofocus -- o nome é o primeiro campo do modal
            autoFocus
          />
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("entity_templates.description_placeholder")}
            className="min-h-20 w-full resize-none text-14"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
          <Button variant="secondary" size="lg" type="button" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSaving} disabled={!name.trim()}>
            {t("entity_templates.save")}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}

const TemplateRow = observer(function TemplateRow(props: {
  workspaceSlug: string;
  template: TEntityTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { workspaceSlug, template, onEdit, onDelete } = props;
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const { getUserDetails } = useMember();
  const author = template.created_by ? getUserDetails(template.created_by) : undefined;
  const scope = template.project
    ? (getProjectById(template.project)?.name ?? t("entity_templates.scope_project"))
    : t("entity_templates.scope_workspace");

  const openToWorkspace = async () => {
    try {
      await entityTemplateService.update(workspaceSlug, template.id, { project_only: false });
      void revalidateEntityTemplates(workspaceSlug);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("entity_templates.save_error") });
    }
  };

  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-body-sm-medium text-primary">{template.name}</span>
        {template.description && (
          <span className="line-clamp-2 text-body-xs-regular text-secondary">{template.description}</span>
        )}
        <span className="text-caption-sm-regular text-tertiary">
          {[
            scope,
            template.kind === "page"
              ? null
              : t("entity_templates.summary_items", { count: template.summary.work_items }),
            author?.display_name,
            renderFormattedDate(template.created_at),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <CustomMenu
        customButton={
          <span className="grid size-7 place-items-center rounded-sm text-placeholder hover:bg-layer-1 hover:text-secondary">
            <MoreHorizontal className="size-4" />
          </span>
        }
        placement="bottom-end"
        closeOnSelect
      >
        <CustomMenu.MenuItem onClick={onEdit} className="flex items-center gap-2">
          <Pencil className="size-3.5" />
          {t("entity_templates.edit")}
        </CustomMenu.MenuItem>
        {template.project && (
          <CustomMenu.MenuItem onClick={() => void openToWorkspace()} className="flex items-center gap-2">
            <Globe className="size-3.5" />
            {t("entity_templates.make_workspace_wide")}
          </CustomMenu.MenuItem>
        )}
        <CustomMenu.MenuItem onClick={onDelete} className="flex items-center gap-2 text-danger-primary">
          <Trash2 className="size-3.5" />
          {t("delete")}
        </CustomMenu.MenuItem>
      </CustomMenu>
    </div>
  );
});

/** Pespo: Configurações → Modelos. Os modelos são salvos pelo menu "⋯" de cada item, módulo, ciclo,
 * página ou projeto; aqui só se renomeia, abre para o workspace ou apaga. */
export const EntityTemplatesSettingsRoot = observer(function EntityTemplatesSettingsRoot(props: {
  workspaceSlug: string;
}) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const { data: templates, isLoading } = useEntityTemplates(workspaceSlug);
  const [editing, setEditing] = useState<TEntityTemplate | null>(null);
  const [deleting, setDeleting] = useState<TEntityTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      await entityTemplateService.remove(workspaceSlug, deleting.id);
      void revalidateEntityTemplates(workspaceSlug);
      setDeleting(null);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("entity_templates.delete_error") });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-body-xs-regular text-secondary">{t("entity_templates.settings_hint")}</p>
      {!isLoading && (templates ?? []).length === 0 && (
        <div className="rounded-md border border-dashed border-subtle px-4 py-8 text-center text-body-xs-regular text-tertiary">
          {t("entity_templates.empty")}
        </div>
      )}
      {KIND_ORDER.map((kind) => {
        const items = (templates ?? []).filter((template) => template.kind === kind);
        if (items.length === 0) return null;
        return (
          <section key={kind} className="flex flex-col gap-2">
            <h4 className="text-body-sm-medium text-secondary">{t(`entity_templates.kind_plural.${kind}`)}</h4>
            <div className="divide-y divide-subtle rounded-md border border-subtle">
              {items.map((template) => (
                <TemplateRow
                  key={template.id}
                  workspaceSlug={workspaceSlug}
                  template={template}
                  onEdit={() => setEditing(template)}
                  onDelete={() => setDeleting(template)}
                />
              ))}
            </div>
          </section>
        );
      })}
      {editing && (
        <EditTemplateModal workspaceSlug={workspaceSlug} template={editing} onClose={() => setEditing(null)} />
      )}
      <AlertModalCore
        isOpen={!!deleting}
        handleClose={() => setDeleting(null)}
        handleSubmit={() => void handleDelete()}
        isSubmitting={isDeleting}
        title={t("entity_templates.delete_title")}
        content={t("entity_templates.delete_confirmation", { name: deleting?.name ?? "" })}
      />
    </div>
  );
});
