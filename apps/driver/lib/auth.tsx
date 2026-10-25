// Driver session: token kept in secure storage; profile and onboarding status from /driver/me.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { brand } from "@primecabs/mobile-ui";
import { ActivityIndicator, View } from "react-native";
import { ApiError, api, setSessionToken, setUnauthorizedHandler, tokenStore } from "./api";
import type { DriverMe } from "./types";

interface Session {
  ready: boolean;
  signedIn: boolean;
  me: DriverMe | undefined;
  meLoading: boolean;
  meError: unknown;
  refetchMe: () => Promise<unknown>;
  signIn(token: string): Promise<void>;
  signOut(): Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const signOut = useCallback(async () => {
    await tokenStore.set(null);
    setSessionToken(null);
    setSignedIn(false);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
    tokenStore.get().then((t) => {
      setSessionToken(t);
      setSignedIn(!!t);
      setReady(true);
    });
  }, [signOut]);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<DriverMe>("/driver/me"),
    enabled: signedIn,
    retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
  });

  const signIn = useCallback(async (token: string) => {
    await tokenStore.set(token);
    setSessionToken(token);
    setSignedIn(true);
  }, []);

  const value = useMemo<Session>(
    () => ({ ready, signedIn, me: me.data, meLoading: me.isLoading, meError: me.error, refetchMe: me.refetch, signIn, signOut }),
    [ready, signedIn, me.data, me.isLoading, me.error, me.refetch, signIn, signOut],
  );
  // Render nothing until the saved token is loaded. Otherwise a screen opened directly
  // (deep link, web reload) calls the API without a token, gets a 401 and signs the driver out.
  if (!ready) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: brand.navy }}><ActivityIndicator color={brand.teal} size="large" /></View>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}

/** Where a signed-in driver belongs, based on their review status. */
export function homeFor(me: DriverMe): "/onboarding" | "/status" | "/(tabs)" {
  if (me.status === "APPROVED") return "/(tabs)";
  if (me.status === "DRAFT" || me.status === "REJECTED") return "/onboarding";
  return "/status";
}
