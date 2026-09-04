/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useHome } from "@/hooks/store/use-home";
// local imports
import type { TTaskOperations } from "./use-tasks";

type Props = {
  taskId: string;
  taskOperations: TTaskOperations;
};

export const TaskItem = observer(function TaskItem(props: Props) {
  const { taskId, taskOperations } = props;
  const [isUpdating, setIsUpdating] = useState(false);
  const {
    tasks: { getTaskById },
  } = useHome();
  const { t } = useTranslation();
  const task = getTaskById(taskId);

  if (!task) return null;

  return (
    <div className="group/task-item flex items-center gap-2 rounded-sm px-1 py-1.5 hover:bg-layer-1">
      <Checkbox
        checked={task.is_completed}
        disabled={isUpdating}
        onChange={async () => {
          setIsUpdating(true);
          await taskOperations.update(task.id, { is_completed: !task.is_completed });
          setIsUpdating(false);
        }}
      />
      <span
        className={cn("flex-1 truncate text-13 text-primary", {
          "text-tertiary line-through": task.is_completed,
        })}
      >
        {task.title}
      </span>
      <button
        type="button"
        onClick={() => taskOperations.remove(task.id)}
        className="flex-shrink-0 rounded-sm p-0.5 text-placeholder opacity-0 group-hover/task-item:opacity-100 hover:bg-layer-2 hover:text-secondary"
        aria-label={t("home.tasks.remove")}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
});
