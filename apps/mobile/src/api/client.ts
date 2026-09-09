import { create, type AxiosInstance } from "axios";
import type { PlaneSession } from "@/auth/session";

// Plane's public API (api/v1) authenticates with a per-workspace personal
// API token sent as the X-Api-Key header — not a Bearer token.
// See apps/api/plane/api/middleware/api_authentication.py in the plane repo.
export function createApiClient(session: PlaneSession): AxiosInstance {
  return create({
    baseURL: `${session.baseUrl}/api/v1/`,
    headers: {
      "X-Api-Key": session.apiToken,
    },
    timeout: 15000,
  });
}

export function workspacePath(session: PlaneSession, path: string): string {
  return `workspaces/${session.workspaceSlug}/${path}`;
}
