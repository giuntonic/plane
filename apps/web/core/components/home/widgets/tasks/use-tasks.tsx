/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TTask } from "@plane/types";
import { useHome } from "@/hooks/store/use-home";

export type TTaskOperations = {
  create: (data: Partial<TTask>) => Promise<void>;
  update: (taskId: string, data: Partial<TTask>) => Promise<void>;
  remove: (taskId: string) => Promise<void>;
};

export const useTasks = (workspaceSlug: string) => {
  // hooks
  const {
    tasks: { createTask, updateTask, removeTask, fetchTasks },
  } = useHome();
  const { t } = useTranslation();

  const taskOperations: TTaskOperations = useMemo(
    () => ({
      create: async (data: Partial<TTask>) => {
        try {
          if (!workspaceSlug) throw new Error("Missing required fields");
          await createTask(workspaceSlug, data);
        } catch (error: any) {
          setToast({
            message: error?.data?.error ?? t("home.tasks.toasts.not_created"),
            type: TOAST_TYPE.ERROR,
            title: t("toast.error"),
          });
          throw error;
        }
      },
      update: async (taskId: string, data: Partial<TTask>) => {
        try {
          if (!workspaceSlug) throw new Error("Missing required fields");
          await updateTask(workspaceSlug, taskId, data);
        } catch (error: any) {
          setToast({
            message: error?.data?.error ?? t("home.tasks.toasts.not_updated"),
            type: TOAST_TYPE.ERROR,
            title: t("toast.error"),
          });
          throw error;
        }
      },
      remove: async (taskId: string) => {
        try {
          if (!workspaceSlug) throw new Error("Missing required fields");
          await removeTask(workspaceSlug, taskId);
        } catch (error: any) {
          setToast({
            message: error?.data?.error ?? t("home.tasks.toasts.not_removed"),
            type: TOAST_TYPE.ERROR,
            title: t("toast.error"),
          });
        }
      },
    }),
    [workspaceSlug, createTask, updateTask, removeTask, t]
  );

  return { taskOperations, fetchTasks };
};
