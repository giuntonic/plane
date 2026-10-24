/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: subtarefas leves (checklist em árvore) de um item de trabalho.

/** A checklist line as returned by …/issues/<id>/checklist-items/. The list is flat; `parent` builds the tree. */
export type TIssueChecklistItem = {
  id: string;
  issue: string;
  project: string;
  workspace: string;
  parent: string | null;
  name: string;
  is_completed: boolean;
  completed_at: string | null;
  assignee: string | null;
  due_date: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TIssueChecklistItemPayload = Partial<
  Pick<TIssueChecklistItem, "parent" | "name" | "is_completed" | "assignee" | "due_date" | "sort_order">
>;

/** …/checklist-items/<id>/convert/: the work item the line became. */
export type TIssueChecklistConvertResponse = {
  id: string;
  project_id: string;
  sequence_id: number;
  name: string;
  parent_id: string | null;
};

/** …/issues/<id>/convert-to-checklist/: the work item became a line of `target_issue_id`. */
export type TIssueConvertToChecklistResponse = {
  checklist_item_id: string;
  target_issue_id: string;
  project_id: string;
};

/** …/projects/<id>/checklist-progress/: only work items with at least one line. */
export type TIssueChecklistProgress = Record<string, { done: number; total: number }>;
