import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AxiosInstance } from "axios";
import { createApiClient } from "@/api/client";
import type { TApiUser } from "@/api/types";
import { clearSession, loadSession, saveSession, type PlaneSession } from "@/auth/session";

interface AuthContextValue {
  session: PlaneSession | null;
  api: AxiosInstance | null;
  isLoading: boolean;
  signIn: (session: PlaneSession) => Promise<TApiUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PlaneSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSession()
      .then(setSession)
      .finally(() => setIsLoading(false));
  }, []);

  const signIn = useCallback(async (next: PlaneSession) => {
    // Validate the token against the instance before persisting it, so a
    // typo in the URL/token/slug fails fast on the login screen.
    const api = createApiClient(next);
    const { data } = await api.get<TApiUser>("users/me/");
    await saveSession(next);
    setSession(next);
    return data;
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);

  const api = useMemo(() => (session ? createApiClient(session) : null), [session]);

  const value = useMemo(
    () => ({ session, api, isLoading, signIn, signOut }),
    [session, api, isLoading, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
