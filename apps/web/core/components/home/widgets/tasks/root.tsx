/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { THomeWidgetProps, TTask } from "@plane/types";
import { countCompletedChecklistItems } from "@plane/utils";
// components
import type { TChecklistTreeLabels, TChecklistTreeNode, TChecklistTreeNodePayload } from "@/components/checklist-tree";
import { ChecklistTreeList, useChecklistTreeOperations } from "@/components/checklist-tree";
// services
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

/** The task list is drawn by the same tree as the work item checklist; only the text field has another name. */
const toNode = (task: TTask): TChecklistTreeNode => ({
  id: task.id,
  parent: task.parent,
  name: task.title,
  is_completed: task.is_completed,
  sort_order: task.sort_order,
  created_at: task.created_at,
});

const toPayload = ({ name, ...rest }: TChecklistTreeNodePayload): Partial<TTask> =>
  name === undefined ? rest : { ...rest, title: name };

export const getHomeTasksKey = (workspaceSlug: string) => `HOME_TASKS_${workspaceSlug}`;

// Pespo: widget "Tarefas" da home — lista privada de cada pessoa, com subtarefas (Tab recua, Enter cria a próxima).
export const DashboardTaskList = observer(function DashboardTaskList(props: THomeWidgetProps) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();

  const operations = useChecklistTreeOperations<TChecklistTreeNode, TChecklistTreeNodePayload>({
    key: workspaceSlug ? getHomeTasksKey(workspaceSlug) : null,
    list: async () => (await workspaceService.fetchWorkspaceTasks(workspaceSlug)).map(toNode),
    create: async (payload) => toNode(await workspaceService.createWorkspaceTask(workspaceSlug, toPayload(payload))),
    update: async (id, payload) =>
      toNode(await workspaceService.updateWorkspaceTask(workspaceSlug, id, toPayload(payload))),
    remove: (id) => workspaceService.deleteWorkspaceTask(workspaceSlug, id),
    errorMessage: t("home.tasks.toasts.not_updated"),
  });

  const labels: TChecklistTreeLabels = useMemo(
    () => ({
      placeholder: t("home.tasks.placeholder"),
      addLine: t("home.tasks.add"),
      addChild: t("home.tasks.add_child"),
      delete: t("home.tasks.remove"),
      expand: t("issue_checklist.expand"),
      collapse: t("issue_checklist.collapse"),
      drag: t("issue_checklist.drag"),
      hint: t("issue_checklist.hint"),
    }),
    [t]
  );

  const total = operations.items.length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-14 font-semibold text-tertiary">{t("home.tasks.title")}</div>
        {total > 0 && (
          <span className="text-caption-sm-regular text-tertiary">
            {countCompletedChecklistItems(operations.items)}/{total}
          </span>
        )}
      </div>
      <ChecklistTreeList
        scopeId={`home-tasks-${workspaceSlug}`}
        disabled={false}
        operations={operations}
        labels={labels}
        emptyState={
          <div className="rounded-lg bg-layer-1 py-6 text-center text-13 text-placeholder">{t("home.tasks.empty")}</div>
        }
      />
    </div>
  );
});
