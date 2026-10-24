/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useRef, useState } from "react";
import { observer } from "mobx-react";
import { mutate } from "swr";
// plane imports
import { i18nInstance } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ISearchIssueResponse, TIssue } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
// components
import type { TCreateSubWorkItemProps, THandleTemplateChangeProps } from "@/components/issues/issue-modal/context";
import { IssueModalContext } from "@/components/issues/issue-modal/context";
import { getCardExtrasKey } from "@/components/issues/card-extras";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useUser } from "@/hooks/store/user/user-user";
// services
import { entityTemplateService } from "@/services/entity-template.service";
import { issueChecklistService } from "@/services/issue-checklist.service";

export type TIssueModalProviderProps = {
  templateId?: string;
  dataForPreload?: Partial<TIssue>;
  allowedProjectIds?: string[];
  children: React.ReactNode;
};

export const IssueModalProvider = observer(function IssueModalProvider(props: TIssueModalProviderProps) {
  const { children, allowedProjectIds, dataForPreload, templateId } = props;
  // states
  const [selectedParentIssue, setSelectedParentIssue] = useState<ISearchIssueResponse | null>(null);
  // Pespo: modelo de item escolhido no formulário (preenche os campos; a estrutura entra depois de criar).
  const [workItemTemplateId, setWorkItemTemplateId] = useState<string | null>(templateId ?? null);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  // Pespo: "Fazer uma cópia" abre o modal com `sourceIssueId`. O base.tsx apaga o campo antes de criar,
  // então ele fica guardado aqui desde a abertura do modal.
  const sourceIssueIdRef = useRef(dataForPreload?.sourceIssueId);
  // store hooks
  const { projectsWithCreatePermissions } = useUser();
  const { fetchIssue, fetchSubIssues } = useIssueDetail();
  const { issues: projectIssues } = useIssues(EIssuesStoreType.PROJECT);
  // derived values
  const projectIdsWithCreatePermissions = Object.keys(projectsWithCreatePermissions ?? {});

  /** Pespo: escolher um modelo preenche nome, descrição, prioridade, etiquetas e responsáveis. */
  const handleTemplateChange = async ({ workspaceSlug, reset, editorRef, projectId }: THandleTemplateChangeProps) => {
    if (!workItemTemplateId || !projectId) return;
    setIsApplyingTemplate(true);
    try {
      const template = await entityTemplateService.retrieve(workspaceSlug, workItemTemplateId, projectId);
      const prefill = template.prefill ?? {};
      reset((current) => ({
        ...current,
        name: prefill.name ?? current.name,
        description_html: prefill.description_html ?? current.description_html,
        priority: (prefill.priority as TIssue["priority"]) ?? current.priority,
        label_ids: prefill.label_ids ?? current.label_ids,
        assignee_ids: prefill.assignee_ids ?? current.assignee_ids,
        estimate_point: prefill.estimate_point ?? current.estimate_point,
      }));
      if (prefill.description_html) editorRef.current?.setEditorValue(prefill.description_html);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: i18nInstance.t("entity_templates.load_error") });
      setWorkItemTemplateId(null);
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  /** Pespo: depois de criar a cópia (ou o item a partir de um modelo), recria embaixo dele as subtarefas,
   * os links e os sub-itens do original. */
  const handleCreateSubWorkItem = async ({ workspaceSlug, projectId, parentId }: TCreateSubWorkItemProps) => {
    const sourceIssueId = sourceIssueIdRef.current;
    if (!sourceIssueId && !workItemTemplateId) return;
    try {
      if (sourceIssueId) await issueChecklistService.copyStructure(workspaceSlug, projectId, parentId, sourceIssueId);
      else if (workItemTemplateId)
        await entityTemplateService.apply(workspaceSlug, workItemTemplateId, {
          project_id: projectId,
          issue_id: parentId,
        });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: i18nInstance.t("work_item_structure.copy_error_title"),
        message: i18nInstance.t("work_item_structure.copy_error"),
      });
      return;
    }
    // Contadores do item novo, a lista de sub-itens dele e a lista do projeto (os sub-itens novos).
    await Promise.allSettled([
      fetchIssue(workspaceSlug, projectId, parentId),
      fetchSubIssues(workspaceSlug, projectId, parentId),
      projectIssues.fetchIssuesWithExistingPagination(workspaceSlug, projectId, "mutation"),
      mutate(getCardExtrasKey(projectId)),
    ]);
  };

  return (
    <IssueModalContext.Provider
      // oxlint-disable-next-line react/jsx-no-constructed-context-values
      value={{
        allowedProjectIds: allowedProjectIds ?? projectIdsWithCreatePermissions,
        workItemTemplateId,
        setWorkItemTemplateId,
        isApplyingTemplate,
        setIsApplyingTemplate,
        selectedParentIssue,
        setSelectedParentIssue,
        issuePropertyValues: {},
        setIssuePropertyValues: () => {},
        issuePropertyValueErrors: {},
        setIssuePropertyValueErrors: () => {},
        getIssueTypeIdOnProjectChange: () => null,
        getActiveAdditionalPropertiesLength: () => 0,
        handlePropertyValuesValidation: () => true,
        handleCreateUpdatePropertyValues: () => Promise.resolve(),
        handleProjectEntitiesFetch: () => Promise.resolve(),
        handleTemplateChange,
        handleConvert: () => Promise.resolve(),
        handleCreateSubWorkItem,
      }}
    >
      {children}
    </IssueModalContext.Provider>
  );
});
