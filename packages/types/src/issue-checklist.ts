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
  /** Named checklist the line belongs to; null = the default list ("Subtarefas"). */
  checklist: string | null;
  name: string;
  is_completed: boolean;
  completed_at: string | null;
  assignee: string | null;
  due_date: string | null;
  /** Optional state of the project's workflow; kept in step with is_completed by the server. */
  state: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TIssueChecklistItemPayload = Partial<
  Pick<
    TIssueChecklistItem,
    "parent" | "checklist" | "name" | "is_completed" | "assignee" | "due_date" | "state" | "sort_order"
  >
>;

/** A named checklist of a work item (…/issues/<id>/checklists/). Its lines come from the lines endpoint. */
export type TIssueChecklist = {
  id: string;
  issue: string;
  project: string;
  workspace: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TIssueChecklistPayload = Partial<Pick<TIssueChecklist, "name" | "sort_order">>;

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

/**
 * …/projects/<id>/card-extras/: what the list and board cards show besides the work item fields. Only work
 * items with something to show are present.
 */
export type TIssueCardExtras = Record<
  string,
  {
    /** Checklist lines done / total, across every list of the work item. */
    checklist?: { done: number; total: number };
    /** Cover image (an image attachment of the work item), as an API path. */
    cover?: string;
    /** The work item has an active repeat rule. */
    recurring?: boolean;
  }
>;

export type TIssueRecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

/** …/issues/<id>/recurrence/: the repeat rule of a work item (copies are created on each date). */
export type TIssueRecurrence = {
  id: string;
  issue: string;
  frequency: TIssueRecurrenceFrequency;
  interval: number;
  /** 0 = Monday … 6 = Sunday (weekly only). */
  weekdays: number[];
  anchor_date: string;
  end_date: string | null;
  /** Next copy to create; null = the series ended. */
  next_date: string | null;
  created_count: number;
  last_created_issue: string | null;
};

export type TIssueRecurrencePayload = {
  frequency: TIssueRecurrenceFrequency;
  interval: number;
  weekdays: number[];
  end_date: string | null;
};
