import type { AxiosInstance } from "axios";
import type { PlaneSession } from "@/auth/session";
import { workspacePath } from "@/api/client";
import type { TApiComment, TApiIssue, TApiLabel, TApiProject, TApiState, TPaginatedResponse } from "@/api/types";

export async function listProjects(api: AxiosInstance, session: PlaneSession): Promise<TApiProject[]> {
  const { data } = await api.get<TApiProject[]>(workspacePath(session, "projects-lite/"));
  return data;
}

export async function listIssues(
  api: AxiosInstance,
  session: PlaneSession,
  projectId: string,
  cursor?: string
): Promise<TPaginatedResponse<TApiIssue>> {
  const { data } = await api.get<TPaginatedResponse<TApiIssue>>(
    workspacePath(session, `projects/${projectId}/work-items/`),
    { params: cursor ? { cursor } : undefined }
  );
  return data;
}

export async function getIssue(
  api: AxiosInstance,
  session: PlaneSession,
  projectId: string,
  issueId: string
): Promise<TApiIssue> {
  const { data } = await api.get<TApiIssue>(workspacePath(session, `projects/${projectId}/work-items/${issueId}/`));
  return data;
}

export async function createIssue(
  api: AxiosInstance,
  session: PlaneSession,
  projectId: string,
  payload: { name: string; description_html?: string; priority?: TApiIssue["priority"]; state?: string }
): Promise<TApiIssue> {
  const { data } = await api.post<TApiIssue>(workspacePath(session, `projects/${projectId}/work-items/`), payload);
  return data;
}

export async function updateIssue(
  api: AxiosInstance,
  session: PlaneSession,
  projectId: string,
  issueId: string,
  payload: Partial<Pick<TApiIssue, "name" | "description_html" | "priority" | "state">>
): Promise<TApiIssue> {
  const { data } = await api.patch<TApiIssue>(
    workspacePath(session, `projects/${projectId}/work-items/${issueId}/`),
    payload
  );
  return data;
}

export async function listStates(api: AxiosInstance, session: PlaneSession, projectId: string): Promise<TApiState[]> {
  const { data } = await api.get<TPaginatedResponse<TApiState> | TApiState[]>(
    workspacePath(session, `projects/${projectId}/states/`)
  );
  return Array.isArray(data) ? data : data.results;
}

export async function listLabels(api: AxiosInstance, session: PlaneSession, projectId: string): Promise<TApiLabel[]> {
  const { data } = await api.get<TPaginatedResponse<TApiLabel> | TApiLabel[]>(
    workspacePath(session, `projects/${projectId}/labels/`)
  );
  return Array.isArray(data) ? data : data.results;
}

export async function listComments(
  api: AxiosInstance,
  session: PlaneSession,
  projectId: string,
  issueId: string
): Promise<TApiComment[]> {
  const { data } = await api.get<TPaginatedResponse<TApiComment> | TApiComment[]>(
    workspacePath(session, `projects/${projectId}/work-items/${issueId}/comments/`)
  );
  return Array.isArray(data) ? data : data.results;
}

export async function createComment(
  api: AxiosInstance,
  session: PlaneSession,
  projectId: string,
  issueId: string,
  commentHtml: string
): Promise<TApiComment> {
  const { data } = await api.post<TApiComment>(
    workspacePath(session, `projects/${projectId}/work-items/${issueId}/comments/`),
    { comment_html: commentHtml }
  );
  return data;
}
