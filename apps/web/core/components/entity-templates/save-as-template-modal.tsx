/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Checkbox, Input, ModalCore, TextArea } from "@plane/ui";
// services
import { entityTemplateService } from "@/services/entity-template.service";
// local imports
import { saveTemplateModalStore } from "./save-modal-store";
import { revalidateEntityTemplates } from "./use-entity-templates";

type Props = { workspaceSlug: string };

/** Pespo: "Salvar como modelo" de item de trabalho, módulo, ciclo, página ou projeto. */
export const SaveAsTemplateModal = observer(function SaveAsTemplateModal(props: Props) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const { request, close } = saveTemplateModalStore;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workspaceWide, setWorkspaceWide] = useState(false);
  const [includeWorkItems, setIncludeWorkItems] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!request) return;
    setName(request.sourceName);
    setDescription("");
    setWorkspaceWide(false);
    setIncludeWorkItems(true);
  }, [request]);

  if (!request) return null;
  const isProject = request.kind === "project";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await entityTemplateService.create(workspaceSlug, {
        kind: request.kind,
        source_id: request.sourceId,
        name: name.trim(),
        description: description.trim(),
        project_only: !workspaceWide,
        include_work_items: includeWorkItems,
      });
      void revalidateEntityTemplates(workspaceSlug);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("entity_templates.saved", { name: name.trim() }) });
      close();
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("entity_templates.save_error"),
        message: code === "TEMPLATE_TOO_LARGE" ? t("entity_templates.too_large") : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalCore isOpen handleClose={close} preventOutsideClick>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className="space-y-4 p-5">
          <div className="space-y-1">
            <h3 className="text-18 font-medium text-secondary">{t(`entity_templates.save_title.${request.kind}`)}</h3>
            <p className="text-body-xs-regular text-tertiary">{t(`entity_templates.save_hint.${request.kind}`)}</p>
          </div>
          <Input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("entity_templates.name_placeholder")}
            className="w-full"
            maxLength={255}
            // oxlint-disable-next-line jsx_a11y/no-autofocus -- o nome é o único campo obrigatório
            autoFocus
          />
          <TextArea
            id="template-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("entity_templates.description_placeholder")}
            className="min-h-20 w-full resize-none text-14"
          />
          {!isProject && (
            <label className="flex cursor-pointer items-start gap-2 text-body-xs-regular text-secondary">
              <Checkbox checked={workspaceWide} onChange={(e) => setWorkspaceWide(e.target.checked)} />
              <span>{t("entity_templates.workspace_wide")}</span>
            </label>
          )}
          {isProject && (
            <label className="flex cursor-pointer items-start gap-2 text-body-xs-regular text-secondary">
              <Checkbox checked={includeWorkItems} onChange={(e) => setIncludeWorkItems(e.target.checked)} />
              <span>{t("entity_templates.include_work_items")}</span>
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
          <Button variant="secondary" size="lg" type="button" onClick={close}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSaving} disabled={!name.trim()}>
            {t("entity_templates.save")}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});
