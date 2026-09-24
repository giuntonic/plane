/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
// types
import type { TTask, TTaskIdMap, TTaskMap } from "@plane/types";
// services
import { WorkspaceService } from "@/services/workspace.service";

export interface IWorkspaceTaskStoreActions {
  addTasks: (workspaceSlug: string, tasks: TTask[]) => void;
  fetchTasks: (workspaceSlug: string) => Promise<TTask[]>;
  createTask: (workspaceSlug: string, data: Partial<TTask>) => Promise<TTask>;
  updateTask: (workspaceSlug: string, taskId: string, data: Partial<TTask>) => Promise<TTask>;
  removeTask: (workspaceSlug: string, taskId: string) => Promise<void>;
}

export interface IWorkspaceTaskStore extends IWorkspaceTaskStoreActions {
  // observables
  tasks: TTaskIdMap;
  taskMap: TTaskMap;
  // helper methods
  getTasksByWorkspaceId: (workspaceSlug: string) => string[] | undefined;
  getTaskById: (taskId: string) => TTask | undefined;
}

export class WorkspaceTaskStore implements IWorkspaceTaskStore {
  // observables
  tasks: TTaskIdMap = {};
  taskMap: TTaskMap = {};
  // services
  workspaceService: WorkspaceService;

  constructor() {
    makeObservable(this, {
      // observables
      tasks: observable,
      taskMap: observable,
      // actions
      addTasks: action.bound,
      fetchTasks: action,
      createTask: action,
      updateTask: action,
      removeTask: action,
    });
    // services
    this.workspaceService = new WorkspaceService();
  }

  // helper methods
  getTasksByWorkspaceId = (workspaceSlug: string) => {
    if (!workspaceSlug) return undefined;
    return this.tasks[workspaceSlug] ?? undefined;
  };

  getTaskById = (taskId: string) => {
    if (!taskId) return undefined;
    return this.taskMap[taskId] ?? undefined;
  };

  // actions
  addTasks = (workspaceSlug: string, tasks: TTask[]) => {
    runInAction(() => {
      this.tasks[workspaceSlug] = tasks.map((task) => task.id);
      tasks.forEach((task) => set(this.taskMap, task.id, task));
    });
  };

  fetchTasks = async (workspaceSlug: string) => {
    const response = await this.workspaceService.fetchWorkspaceTasks(workspaceSlug);
    this.addTasks(workspaceSlug, response);
    return response;
  };

  createTask = async (workspaceSlug: string, data: Partial<TTask>) => {
    const response = await this.workspaceService.createWorkspaceTask(workspaceSlug, data);

    runInAction(() => {
      this.tasks[workspaceSlug] = [...(this.tasks[workspaceSlug] ?? []), response.id];
      set(this.taskMap, response.id, response);
    });
    return response;
  };

  updateTask = async (workspaceSlug: string, taskId: string, data: Partial<TTask>) => {
    const originalTask = { ...this.taskMap[taskId] };
    runInAction(() => {
      Object.keys(data).forEach((key) => {
        set(this.taskMap, [taskId, key], data[key as keyof TTask]);
      });
    });

    try {
      const response = await this.workspaceService.updateWorkspaceTask(workspaceSlug, taskId, data);
      return response;
    } catch (error) {
      runInAction(() => {
        set(this.taskMap, taskId, originalTask);
      });
      throw error;
    }
  };

  removeTask = async (workspaceSlug: string, taskId: string) => {
    await this.workspaceService.deleteWorkspaceTask(workspaceSlug, taskId);

    const taskIndex = this.tasks[workspaceSlug]?.findIndex((task) => task === taskId);
    if (taskIndex !== undefined && taskIndex >= 0)
      runInAction(() => {
        this.tasks[workspaceSlug].splice(taskIndex, 1);
        delete this.taskMap[taskId];
      });
  };
}
