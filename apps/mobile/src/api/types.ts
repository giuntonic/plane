// Shapes match the api/v1 (api_token authenticated) serializers in
// apps/api/plane/api/serializers — these are NOT the same as @plane/types,
// which models the session-authenticated app API instead.

export interface TApiUser {
  id: string;
  email: string;
  display_name: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

export interface TApiProject {
  id: string;
  name: string;
  identifier: string;
  description: string | null;
  workspace: string;
  logo_props?: Record<string, unknown>;
}

export interface TApiState {
  id: string;
  name: string;
  color: string;
  group: string;
  sequence: number;
}

export interface TApiLabel {
  id: string;
  name: string;
  color: string;
}

export interface TApiIssue {
  id: string;
  name: string;
  description_html: string | null;
  priority: "urgent" | "high" | "medium" | "low" | "none";
  state: string;
  project: string;
  workspace: string;
  sequence_id: number;
  sort_order: number;
  start_date: string | null;
  target_date: string | null;
  created_at: string;
  updated_at: string;
  assignees?: string[];
  labels?: string[];
}

export interface TApiComment {
  id: string;
  comment_html: string;
  created_at: string;
  actor: string;
  actor_detail?: TApiUser;
}

export interface TPaginatedResponse<T> {
  count: number;
  next_cursor: string | null;
  prev_cursor: string | null;
  next_page_results: boolean;
  results: T[];
}
