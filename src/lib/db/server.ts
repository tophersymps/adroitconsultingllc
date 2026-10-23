/**
 * src/lib/db/server.ts — Neon Data API client for route handlers, server
 * components and pages (Phase 3 of the Neon migration, R2-2).
 *
 * Replaces the former Supabase SSR cookie client (deleted in R2-2) with a
 * PostgREST-compatible client pointed at the **Neon Data API**. The call
 * sites do not change shape: `.from("courses").select("*").eq(...)` and the
 * `{ data, error }` contract are identical because both are PostgREST.
 *
 * AUTHORIZATION IS THE REQUEST'S JWT. The Data API has no service key: it picks
 * the Postgres role from the JWT `role` claim and then applies RLS. So this
 * module resolves, per request:
 *
 *   1. the caller's Managed Better Auth JWT — GET `${NEON_AUTH_BASE_URL}/token`
 *      with the incoming request cookies forwarded (the cookie is httpOnly, so
 *      only the server can do this), or
 *   2. the anonymous JWT — GET `${NEON_AUTH_BASE_URL}/token/anonymous` — when
 *      nobody is signed in. Guest surfaces (the public catalog on /atlas) are
 *      policy-gated to `authenticated, anonymous` and MUST keep working, which
 *      is exactly what an `Authorization: Bearer <session>`-or-nothing client
 *      would break.
 *
 * The token is resolved lazily per request and memoised with React's `cache()`
 * so a page that issues ten queries forwards one token, not ten. Nothing is
 * cached across requests: a token is scoped to one user's session.
 *
 * Env (from BWS → Vercel, never committed):
 *   NEON_AUTH_BASE_URL   e.g. https://<endpoint>.neonauth.<region>.aws.neon.tech/neondb/auth
 *   NEON_DATA_API_URL    e.g. https://<endpoint>.apirest.<region>.aws.neon.tech/neondb/rest/v1
 *
 * Fails CLOSED: a missing endpoint env throws when a client is requested (a
 * misconfigured runtime is a 500, never a silent empty read). The throw is
 * lazy, not at module scope, so `next build` can import route modules on a host
 * without env — same convention the retired Supabase client used.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { NeonPostgrestClient } from "@neondatabase/postgrest-js";
import { getAnonymousJwtResult, type AnonTokenResult } from "./anonymous-token";
import { createTokenUnavailableClient } from "./degraded-client";

/** The minimal user projection the app reads off the session. */
export interface DbSessionUser {
  id: string;
  email: string;
}

type GetUserResult = {
  data: { user: DbSessionUser | null };
  error: Error | null;
};

/**
 * A Data API client that also answers `auth.getUser()`.
 *
 * `.auth.getUser()` is a **compatibility seam**, not a second auth stack: the
 * session is still resolved by Managed Better Auth over the same cookie. It
 * exists so R2-2 stays inside the data layer — the 41 `auth.getUser()` call
 * sites are re-pointed at `getSessionUser()` by R2-1 (auth routes), and until
 * that lands they must keep working against the real session.
 */
export type DbClient = NeonPostgrestClient & {
  auth: { getUser: () => Promise<GetUserResult> };
};

function authBaseUrl(): string {
  const url = process.env.NEON_AUTH_BASE_URL;
  if (!url) throw new Error("NEON_AUTH_BASE_URL is required");
  return url.replace(/\/$/, "");
}

function dataApiUrl(): string {
  const url = process.env.NEON_DATA_API_URL;
  if (!url) throw new Error("NEON_DATA_API_URL is required");
  return url.replace(/\/$/, "");
}

/** The incoming request's cookies, as a Cookie header value (null when none). */
const requestCookieHeader = cache(async (): Promise<string | null> => {
  try {
    const store = await cookies();
    const all = store.getAll();
    if (all.length === 0) return null;
    return all.map((c) => `${c.name}=${c.value}`).join("; ");
  } catch {
    // Outside a request scope (static build pass, script). Guests → anonymous.
    return null;
  }
});

/** Conservative cache lifetime when the token's `exp` claim cannot be read. */
const FALLBACK_TTL_MS = 5 * 60_000;

/** Decode a JWT payload without verifying it — only `exp`/`role` are read. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as unknown;
    return payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * The rate limiter's countdown is the NON-STANDARD `x-retry-after` header
 * (seconds). There is no `Retry-After` on this service, so honouring that
 * would silently no-op.
 */
function parseRetryAfter(headers: Headers): number | undefined {
  const raw = headers.get("x-retry-after");
  if (!raw) return undefined;
  const seconds = Number.parseInt(raw, 10);
  if (!Number.isFinite(seconds)) return undefined;
  return Math.min(Math.max(seconds, 1), 120);
}

/**
 * Resolve a token from the Managed Better Auth token route.
 *
 * NEVER rejects for an HTTP/network/malformed outcome — those are returned as
 * `ok: false` so a guest read degrades instead of throwing (the old
 * unguarded `fetch` here was one of the two 500 mechanisms). A MISSING
 * `NEON_AUTH_BASE_URL` still throws: a misconfigured runtime must fail closed,
 * never silently degrade.
 */
async function fetchTokenResult(
  path: "/token" | "/token/anonymous",
): Promise<AnonTokenResult> {
  const base = authBaseUrl(); // fail closed on missing env (outside the try)
  const cookie = await requestCookieHeader();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { headers, cache: "no-store" });
  } catch {
    return { ok: false, errorClass: "network" };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      errorClass: "http",
      retryAfterSeconds: parseRetryAfter(res.headers),
    };
  }

  const body = (await res.json().catch(() => null)) as { token?: unknown } | null;
  const token = body?.token;
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, status: res.status, errorClass: "malformed" };
  }

  const payload = decodeJwtPayload(token);
  // Defence in depth on the anonymous path: this token is cached process-wide,
  // so it must never be anything but the identity-free `anonymous` role.
  if (path === "/token/anonymous" && payload && typeof payload.role === "string") {
    if (payload.role !== "anonymous") {
      return { ok: false, status: res.status, errorClass: "malformed" };
    }
  }

  const exp = payload && typeof payload.exp === "number" ? payload.exp * 1000 : null;
  return {
    ok: true,
    token,
    expiresAtMs: exp ?? Date.now() + FALLBACK_TTL_MS,
  };
}

/**
 * The signed-in caller's Data API JWT, or null for guests. Per-request only
 * (React `cache`): a session token is NEVER cached across requests/users.
 */
export const getSessionJwt = cache(async (): Promise<string | null> => {
  const result = await fetchTokenResult("/token");
  return result.ok ? result.token : null;
});

/**
 * The `anonymous` role's JWT — used when nobody is signed in. Backed by the
 * cross-request cache in ./anonymous-token (TTL from `exp`, single-flight,
 * circuit breaker). Returns null when no token is available; callers then use
 * the classified degraded client instead of issuing a bare request.
 */
async function getAnonymousJwt(): Promise<string | null> {
  const result = await getAnonymousJwtResult(() =>
    fetchTokenResult("/token/anonymous"),
  );
  return result.ok ? result.token : null;
}

/**
 * The current user, resolved by Managed Better Auth from the session cookie.
 * Guests resolve to null; an unreachable auth backend degrades to null for
 * READS (the gates then render the guest state) — writes have their own 401.
 */
export const getNeonSessionUser = cache(
  async (): Promise<DbSessionUser | null> => {
    const cookie = await requestCookieHeader();
    if (!cookie) return null;
    try {
      const res = await fetch(`${authBaseUrl()}/get-session`, {
        headers: { Cookie: cookie, Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) return null;
      const body = (await res.json().catch(() => null)) as
        | { user?: { id?: string; email?: string } | null }
        | null;
      const user = body?.user;
      if (!user?.id) return null;
      return { id: user.id, email: user.email ?? "" };
    } catch {
      return null;
    }
  },
);

function createDbClient(jwt: string): DbClient {
  if (!jwt) {
    // Unrepresentable by construction (R2-5 S-9): a Data API request without
    // an Authorization header is answered 400 "missing authentication
    // credentials" and is an implicit, unpinnable Postgres role.
    throw new Error("Neon Data API JWT is required");
  }
  const client = new NeonPostgrestClient({
    dataApiUrl: dataApiUrl(),
    options: {
      db: { schema: "public" },
      global: {
        // A plain fetch keeps the client's own header merge intact.
        fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
        headers: { Authorization: `Bearer ${jwt}` },
      },
    },
  });

  const db = client as DbClient;
  db.auth = {
    getUser: async () => {
      const user = await getNeonSessionUser();
      return { data: { user }, error: null };
    },
  };
  return db;
}

/** A client whose reads answer the classified token-unavailable error. */
function createDegradedDbClient(): DbClient {
  return createTokenUnavailableClient(async () => {
    const user = await getNeonSessionUser();
    return { data: { user }, error: null };
  });
}

/**
 * Cookie-bound Data API client for the current request.
 * `await getSupabaseServerClient()` — name kept from the Supabase era so the
 * call sites moved by import path only (R2-2 scope item 1).
 *
 * ALWAYS resolves (R2-5 AC-1): when neither a session JWT nor the anonymous
 * role token can be resolved, the caller gets a classified degraded client
 * instead of a rejection — a guest page must render, never 500.
 */
export const getSupabaseServerClient = cache(
  async (): Promise<DbClient> => {
    const jwt = (await getSessionJwt()) ?? (await getAnonymousJwt());
    return jwt ? createDbClient(jwt) : createDegradedDbClient();
  },
);

/**
 * `anonymous`-role Data API client for surfaces that run without a request
 * session (sitemap generation, static metadata). Reads only what the
 * `authenticated, anonymous` policies expose — the public catalog.
 *
 * Returns the degraded client rather than throwing when the anonymous token is
 * unavailable (R2-5): /sitemap.xml already falls back to its static series
 * list, and a thrown 500 there was the wrong failure mode.
 */
export async function getSupabaseAnonymousClient(): Promise<DbClient> {
  const jwt = await getAnonymousJwt();
  return jwt ? createDbClient(jwt) : createDegradedDbClient();
}

export type SupabaseServerClient = DbClient;
