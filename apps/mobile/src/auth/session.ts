import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "plane-mobile-session";

export interface PlaneSession {
  /** e.g. "https://plane.pespo.com.br" (no trailing slash) */
  baseUrl: string;
  workspaceSlug: string;
  apiToken: string;
}

export async function loadSession(): Promise<PlaneSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlaneSession;
  } catch {
    return null;
  }
}

export async function saveSession(session: PlaneSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}
