// Admin session: token in localStorage, profile and permissions from /admin/me.
// Signs out after 30 minutes without activity, or when the API says the token is no longer valid.
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, api, setUnauthorizedHandler, tokenStore } from "./api";
import type { AdminMe, Permission } from "./types";

const IDLE_MS = 30 * 60_000;

interface AuthState {
  admin: AdminMe | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(reason?: string): void;
  can(p: Permission): boolean;
  signedOutReason: string | null;
  bootError: string | null;
  retry(): void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [admin, setAdmin] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(() => !!tokenStore.get());
  const [signedOutReason, setReason] = useState<string | null>(null);

  const signOut = useCallback(
    (reason?: string) => {
      tokenStore.set(null);
      setAdmin(null);
      setReason(reason ?? null);
      qc.clear();
    },
    [qc],
  );

  const [bootError, setBootError] = useState<string | null>(null);

  // Restore the session on load. Only a 401 ends it; a network error or server restart keeps
  // the token so the admin can retry without signing in again.
  const restore = useCallback(() => {
    if (!tokenStore.get()) return setLoading(false);
    setLoading(true);
    setBootError(null);
    api<AdminMe>("/admin/me")
      .then(setAdmin)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) tokenStore.set(null);
        else setBootError(e instanceof ApiError ? e.message : "Can't reach the server.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => signOut("Your session has expired. Sign in again."));
    restore();
  }, [signOut, restore]);

  // Inactivity timeout
  useEffect(() => {
    if (!admin) return;
    let timer = window.setTimeout(() => signOut("You were signed out after 30 minutes of inactivity."), IDLE_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => signOut("You were signed out after 30 minutes of inactivity."), IDLE_MS);
    };
    const events = ["mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [admin, signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string; admin: AdminMe }>("/auth/admin/login", { method: "POST", body: { email, password } });
    tokenStore.set(r.token);
    setReason(null);
    setAdmin(await api<AdminMe>("/admin/me"));
  }, []);

  const value = useMemo<AuthState>(
    () => ({ admin, loading, signIn, signOut, signedOutReason, bootError, retry: restore, can: (p) => !!admin?.permissions.includes(p) }),
    [admin, loading, signIn, signOut, signedOutReason, bootError, restore],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

export const roleLabel: Record<AdminMe["role"], string> = {
  SUPER_ADMIN: "Super admin",
  LOCATION_ADMIN: "Location admin",
  SUPPORT: "Support",
  ACCOUNTANT: "Accountant",
};
