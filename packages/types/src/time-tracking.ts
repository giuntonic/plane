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

/** Pespo: projects/<id>/monthly-report/ — one client's month (pieces, deadlines, reworks, hours, meetings). */
export type TMonthlyReport = {
  project: { id: string; name: string; identifier: string };
  month: string;
  start: string;
  end: string;
  generated_at: string;
  client_name: string | null;
  contract_status: "ok" | "no_client" | "unavailable";
  contract: { type: string; start_date: string; end_date: string | null } | null;
  balance: { category: string; contracted: number; used: number; available: number }[];
  pieces: {
    requested: { category: string; count: number }[];
    delivered: { category: string; count: number }[];
    delivered_total: number;
    requested_total: number;
    on_time: number;
    with_due_date: number;
    open_now: { backlog: number; unstarted: number; started: number };
    delivered_items: {
      id: string;
      sequence_id: number | null;
      name: string;
      category: string;
      completed_at: string;
      target_date: string | null;
      on_time: boolean | null;
    }[];
  };
  reworks: { total: number; internal: number; client: number };
  hours: {
    total_seconds: number;
    client_visible: boolean;
    by_user: { id: string; display_name: string; seconds: number }[];
    top_items: { id: string; name: string; sequence_id: number; seconds: number }[];
  };
  meetings: {
    items: {
      id: string;
      summary: string;
      start: string;
      issue_id: string;
      issue_name: string;
      issue_sequence_id: number;
    }[];
    recorded: number;
    minutes: {
      id: string;
      title: string;
      started_at: string;
      issue_id: string;
      issue_sequence_id: number;
      client_visible: boolean;
      resumo: string;
    }[];
  };
  // Pespo: peças aprovadas no mês (uma por peça), pelo botão da revisão ou pela mudança de estado
  approvals: {
    total: number;
    by_client: number;
    items: {
      id: string;
      sequence_id: number | null;
      name: string;
      approved_at: string;
      // "client", "team" ou "" (tarefa do sistema)
      role: string;
    }[];
  };
};

/** Pespo: workload/ — the team's load right now. */
export type TWorkloadPerson = {
  id: string;
  display_name: string;
  open: number;
  started: number;
  overdue: number;
  due_soon: number;
  subtasks_open: number;
  subtasks_overdue: number;
  week_seconds: number;
  projects: { identifier: string; count: number }[];
  upcoming: {
    id: string;
    name: string;
    sequence_id: number;
    project_identifier: string;
    target_date: string;
    overdue: boolean;
  }[];
};
export type TWorkload = { today: string; week_start: string; people: TWorkloadPerson[] };
