/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { THomeWidgetProps } from "@plane/types";
// hooks
import { useHome } from "@/hooks/store/use-home";
// local imports
import { TaskItem } from "./task-item";
import { useTasks } from "./use-tasks";

export const DashboardTaskList = observer(function DashboardTaskList(props: THomeWidgetProps) {
  const { workspaceSlug } = props;
  const [title, setTitle] = useState("");
  const { taskOperations, fetchTasks } = useTasks(workspaceSlug);
  const {
    tasks: { getTasksByWorkspaceId, getTaskById },
  } = useHome();
  const { t } = useTranslation();

  useSWR(
    workspaceSlug ? `HOME_TASKS_${workspaceSlug}` : null,
    workspaceSlug ? () => fetchTasks(workspaceSlug.toString()) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  const taskIds = getTasksByWorkspaceId(workspaceSlug) ?? [];
  const orderedTaskIds = useMemo(
    () =>
      [...taskIds].sort((a, b) => {
        const taskA = getTaskById(a);
        const taskB = getTaskById(b);
        if (!taskA || !taskB) return 0;
        if (taskA.is_completed !== taskB.is_completed) return taskA.is_completed ? 1 : -1;
        return new Date(taskA.created_at).getTime() - new Date(taskB.created_at).getTime();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [taskIds]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setTitle("");
    await taskOperations.create({ title: trimmedTitle, is_completed: false });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-14 font-semibold text-tertiary">{t("home.tasks.title")}</div>
      </div>
      <form onSubmit={handleSubmit} className="mb-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("home.tasks.add")}
          className="w-full rounded-md border border-subtle bg-surface-2 px-2.5 py-1.5 text-13 text-primary placeholder:text-placeholder focus:border-accent-strong focus:ring-1 focus:ring-accent-strong focus:outline-none"
        />
      </form>
      {orderedTaskIds.length > 0 ? (
        <div className="flex flex-col">
          {orderedTaskIds.map((taskId) => (
            <TaskItem key={taskId} taskId={taskId} taskOperations={taskOperations} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg bg-layer-1 py-6 text-center text-13 text-placeholder">{t("home.tasks.empty")}</div>
      )}
    </div>
  );
});
