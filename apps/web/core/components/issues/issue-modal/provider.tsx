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
import type { TCreateSubWorkItemProps } from "@/components/issues/issue-modal/context";
import { IssueModalContext } from "@/components/issues/issue-modal/context";
import { getChecklistProgressKey } from "@/components/issues/issue-detail-widgets/checklist/helper";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useUser } from "@/hooks/store/user/user-user";
// services
import { issueChecklistService } from "@/services/issue-checklist.service";

export type TIssueModalProviderProps = {
  templateId?: string;
  dataForPreload?: Partial<TIssue>;
  allowedProjectIds?: string[];
  children: React.ReactNode;
};

export const IssueModalProvider = observer(function IssueModalProvider(props: TIssueModalProviderProps) {
  const { children, allowedProjectIds, dataForPreload } = props;
  // states
  const [selectedParentIssue, setSelectedParentIssue] = useState<ISearchIssueResponse | null>(null);
  // Pespo: "Fazer uma cópia" abre o modal com `sourceIssueId`. O base.tsx apaga o campo antes de criar,
  // então ele fica guardado aqui desde a abertura do modal.
  const sourceIssueIdRef = useRef(dataForPreload?.sourceIssueId);
  // store hooks
  const { projectsWithCreatePermissions } = useUser();
  const { fetchIssue, fetchSubIssues } = useIssueDetail();
  const { issues: projectIssues } = useIssues(EIssuesStoreType.PROJECT);
  // derived values
  const projectIdsWithCreatePermissions = Object.keys(projectsWithCreatePermissions ?? {});

  /** Pespo: depois de criar a cópia, recria embaixo dela as subtarefas, os links e os sub-itens do original. */
  const handleCreateSubWorkItem = async ({ workspaceSlug, projectId, parentId }: TCreateSubWorkItemProps) => {
    const sourceIssueId = sourceIssueIdRef.current;
    if (!sourceIssueId) return;
    try {
      await issueChecklistService.copyStructure(workspaceSlug, projectId, parentId, sourceIssueId);
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
      mutate(getChecklistProgressKey(projectId)),
    ]);
  };

  return (
    <IssueModalContext.Provider
      // oxlint-disable-next-line react/jsx-no-constructed-context-values
      value={{
        allowedProjectIds: allowedProjectIds ?? projectIdsWithCreatePermissions,
        workItemTemplateId: null,
        setWorkItemTemplateId: () => {},
        isApplyingTemplate: false,
        setIsApplyingTemplate: () => {},
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
        handleTemplateChange: () => Promise.resolve(),
        handleConvert: () => Promise.resolve(),
        handleCreateSubWorkItem,
      }}
    >
      {children}
    </IssueModalContext.Provider>
  );
});
