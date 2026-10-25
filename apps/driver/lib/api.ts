// PrimeCabs API client for the driver app. Errors always come back as ApiError.
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * In development the API runs on the same computer as Expo, port 4000.
 * On a phone with Expo Go that computer is reached by its network address (from Expo's hostUri).
 */
function apiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined") return `${window.location.protocol}//${window.location.hostname}:4000`;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host ?? "localhost"}:4000`;
}

export const API_BASE = `${apiBase()}/api/v1`;
const TOKEN_KEY = "pc_driver_token";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { fields?: { path: string; message: string }[]; attemptsLeft?: number; missing?: string[]; [k: string]: unknown },
  ) {
    super(message);
  }
  field(path: string) {
    return this.details?.fields?.find((f) => f.path === path)?.message;
  }
}

// Secure storage on the phone (Keychain / Keystore); localStorage on the web preview.
export const tokenStore = {
  async get(): Promise<string | null> {
    try {
      return Platform.OS === "web" ? localStorage.getItem(TOKEN_KEY) : await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async set(token: string | null) {
    try {
      if (Platform.OS === "web") token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);
      else token ? await SecureStore.setItemAsync(TOKEN_KEY, token) : await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      /* storage unavailable: the session lasts until the app closes */
    }
  },
};

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;
export const setSessionToken = (t: string | null) => (token = t);
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

type Query = Record<string, string | number | undefined | null>;

export async function api<T>(path: string, opts: { method?: "GET" | "POST" | "PUT"; body?: unknown; query?: Query; form?: FormData } = {}): Promise<T> {
  const qs = opts.query
    ? Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ""}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers: {
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "No internet connection. Check your network and try again.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error ?? {};
    if (res.status === 401 && !path.startsWith("/auth/")) onUnauthorized?.();
    throw new ApiError(res.status, e.code ?? "ERROR", e.message ?? "Something went wrong. Try again.", e.details);
  }
  return json as T;
}

export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");
