/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "./common";
import type { TIssuePriorities } from "./issues";

export type TRecentActivityFilterKeys = "all item" | "issue" | "page" | "project" | "workspace_page";
export type THomeWidgetKeys =
  | "quick_links"
  | "recents"
  | "my_stickies"
  | "task_list"
  | "google_calendar"
  | "quick_tutorial"
  | "new_at_plane";

export type THomeWidgetProps = {
  workspaceSlug: string;
};

export type TPageEntityData = {
  id: string;
  name: string;
  logo_props: TLogoProps;
  project_id?: string;
  owned_by: string;
  project_identifier?: string;
};

export type TProjectEntityData = {
  id: string;
  name: string;
  logo_props: TLogoProps;
  project_members: string[];
  identifier: string;
};

export type TIssueEntityData = {
  id: string;
  name: string;
  state: string;
  priority: TIssuePriorities;
  assignees: string[];
  type: string | null;
  sequence_id: number;
  project_id: string;
  project_identifier: string;
  is_epic: boolean;
};

export type TActivityEntityData = {
  id: string;
  entity_name: "page" | "project" | "issue" | "workspace_page";
  entity_identifier: string;
  visited_at: string;
  entity_data: TPageEntityData | TProjectEntityData | TIssueEntityData;
};

export type TLinkEditableFields = {
  title: string;
  url: string;
};

/** Pespo: the work item a quick link points to, always with its current name and state. */
export type TLinkIssueDetail = {
  id: string;
  name: string;
  sequence_id: number;
  project_id: string;
  project_identifier: string;
  state_group: string | null;
  state_color: string | null;
};

export type TLink = TLinkEditableFields & {
  created_by_id: string;
  id: string;
  metadata: any;
  workspace_slug: string;
  /** Pespo: set when the link points to a work item instead of a website. */
  issue?: string | null;
  /** Null when the work item was deleted or the user lost access to it. */
  issue_detail?: TLinkIssueDetail | null;

  //need
  created_at: Date;
};

export type TLinkMap = {
  [workspace_slug: string]: TLink;
};

export type TLinkIdMap = {
  [workspace_slug: string]: string[];
};

export type TTaskEditableFields = {
  title: string;
  is_completed: boolean;
  /** Pespo: tasks form a tree (sub-tasks); null = top level. */
  parent: string | null;
  sort_order: number;
};

export type TTask = TTaskEditableFields & {
  id: string;
  workspace: string;
  owner: string;
  created_at: string;
  updated_at: string;
};

/** Pespo: per-user widget settings on the home grid. */
export type THomeWidgetConfig = {
  /** Width in grid columns (1–4). Missing = the default width. */
  w?: number;
  /** Height in px. Missing = as tall as the content. */
  h?: number;
  /** Agenda widget: Google calendars to show ("primary" = the main one). */
  calendar_ids?: string[];
  /** Agenda widget: how many days ahead to list (1 = only today). */
  days?: number;
};

export type TWidgetEntityData = {
  key: THomeWidgetKeys;
  name: string;
  is_enabled: boolean;
  config: THomeWidgetConfig;
  sort_order: number;
};
