/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
// plane imports
import { i18nInstance } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TEntityTemplate, TEntityTemplateApplyPayload, TEntityTemplateKind } from "@plane/types";
// services
import { entityTemplateService } from "@/services/entity-template.service";

/** Pespo: modelo escolhido num modal de criação (módulo, ciclo, projeto). `choose` busca o que preenche o
 * formulário; `apply` cria a estrutura depois que a entidade existe. */
export const useEntityTemplateForCreate = (workspaceSlug: string, kind: TEntityTemplateKind) => {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<TEntityTemplate["prefill"] | null>(null);

  const choose = useCallback(
    async (id: string | null, projectId?: string | null) => {
      setTemplateId(id);
      setPrefill(null);
      if (!id) return;
      try {
        const template = await entityTemplateService.retrieve(workspaceSlug, id, projectId ?? undefined);
        setPrefill(template.prefill ?? {});
      } catch {
        setTemplateId(null);
        setToast({ type: TOAST_TYPE.ERROR, title: i18nInstance.t("entity_templates.load_error") });
      }
    },
    [workspaceSlug]
  );

  const apply = useCallback(
    async (payload: TEntityTemplateApplyPayload) => {
      if (!templateId) return undefined;
      try {
        return await entityTemplateService.apply(workspaceSlug, templateId, payload);
      } catch {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: i18nInstance.t("entity_templates.apply_error_title"),
          message: i18nInstance.t(`entity_templates.apply_error.${kind}`),
        });
        return undefined;
      }
    },
    [workspaceSlug, templateId, kind]
  );

  const clear = useCallback(() => {
    setTemplateId(null);
    setPrefill(null);
  }, []);

  return { templateId, prefill, choose, apply, clear };
};
