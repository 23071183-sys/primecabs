// Thin fetch wrapper for the PrimeCabs API. Errors always come back as ApiError.

// Empty in development (Vite proxies /api). On Render it may be a bare hostname, so add https://.
const RAW_API = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const BASE = `${RAW_API && !/^https?:\/\//.test(RAW_API) ? `https://${RAW_API}` : RAW_API}/api/v1`;
const TOKEN_KEY = "pc_admin_token";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { fields?: { path: string; message: string }[]; [k: string]: unknown },
  ) {
    super(message);
  }
  /** Message for one form field, from a VALIDATION_FAILED response. */
  field(path: string): string | undefined {
    return this.details?.fields?.find((f) => f.path === path)?.message;
  }
}

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage blocked: session lasts until reload */
    }
  },
};

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T>(path: string, opts: { method?: "GET" | "POST" | "PUT"; body?: unknown; query?: Record<string, string | number | undefined | null> } = {}): Promise<T> {
  const qs = opts.query
    ? "?" +
      new URLSearchParams(
        Object.entries(opts.query)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${qs === "?" ? "" : qs}`, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach the server. Check your connection and try again.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error ?? {};
    if (res.status === 401 && path !== "/auth/admin/login") onUnauthorized?.();
    throw new ApiError(res.status, e.code ?? "ERROR", e.message ?? "Something went wrong. Try again.", e.details);
  }
  return json as T;
}

export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");
