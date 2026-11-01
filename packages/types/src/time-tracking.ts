/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Pespo: time spent on a work item (timer or manual entry), per person. */
export type TIssueTimeEntry = {
  id: string;
  issue: string;
  project: string;
  user: string;
  user_display_name: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  note: string;
  source: "timer" | "manual" | "auto_stopped";
  is_running: boolean;
};

/** …/issues/<id>/time-entries/: guests get only the total (and only when the project shows it to clients). */
export type TIssueTimeEntries = {
  total_seconds: number;
  now: string;
  entries: TIssueTimeEntry[] | null;
};

export type TIssueTimeEntryPayload = {
  duration_seconds?: number;
  date?: string;
  started_at?: string;
  note?: string;
};

/** …/time-entries/running/: the timer of the signed-in user, with the work item it belongs to. */
export type TRunningTimeEntry = TIssueTimeEntry & {
  issue_name: string;
  issue_sequence_id: number;
  project_identifier: string;
  workspace_slug: string;
  now: string;
};

/** …/issues/<id>/time-entries/start/: the new timer and the one that was stopped to start it, if any. */
export type TStartedTimeEntry = TRunningTimeEntry & { stopped: TIssueTimeEntry | null };

/** 409 from start/ when another work item's timer is running (send `replace: true` to switch). */
export type TTimerAlreadyRunningError = { error: "TIMER_ALREADY_RUNNING"; running: TRunningTimeEntry };

/** Pespo: workspaces/<slug>/time-report/ — time spent in a period, grouped. Admins see everyone. */
export type TTimeReportParams = { start: string; end: string; project?: string; user?: string };

export type TTimeReport = {
  start: string;
  end: string;
  is_admin: boolean;
  total_seconds: number;
  by_user: { id: string; display_name: string; full_name: string; avatar_url: string | null; seconds: number }[];
  by_project: { id: string; name: string; identifier: string; seconds: number }[];
  by_issue: {
    id: string;
    name: string;
    sequence_id: number;
    project_id: string;
    project_identifier: string;
    seconds: number;
    users: string[];
  }[];
  by_day: { date: string; seconds: number }[];
};
