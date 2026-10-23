/**
 * src/lib/db/server.ts — Neon Data API client for route handlers, server
 * components and pages (Phase 3 of the Neon migration, R2-2).
 *
 * Replaces `src/lib/supabase/server.ts` (the `@supabase/ssr` cookie client) with
 * a PostgREST-compatible client pointed at the **Neon Data API**. The call
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

async function fetchToken(path: string): Promise<string | null> {
  const cookie = await requestCookieHeader();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${authBaseUrl()}${path}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { token?: unknown } | null;
  return typeof body?.token === "string" && body.token.length > 0
    ? body.token
    : null;
}

/** The signed-in caller's Data API JWT, or null for guests. */
export const getSessionJwt = cache((): Promise<string | null> =>
  fetchToken("/token"),
);

/** The `anonymous` role's JWT — used when nobody is signed in. */
const getAnonymousJwt = cache((): Promise<string | null> =>
  fetchToken("/token/anonymous"),
);

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

function createDbClient(jwt: string | null): DbClient {
  const client = new NeonPostgrestClient({
    dataApiUrl: dataApiUrl(),
    options: {
      db: { schema: "public" },
      global: {
        // A plain fetch keeps the client's own header merge intact.
        fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
        ...(jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : {}),
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

/**
 * Cookie-bound Data API client for the current request.
 * `await getSupabaseServerClient()` — name kept from the Supabase era so the
 * call sites moved by import path only (R2-2 scope item 1).
 */
export const getSupabaseServerClient = cache(
  async (): Promise<DbClient> => {
    const jwt = (await getSessionJwt()) ?? (await getAnonymousJwt());
    return createDbClient(jwt);
  },
);

/**
 * `anonymous`-role Data API client for surfaces that run without a request
 * session (sitemap generation, static metadata). Reads only what the
 * `authenticated, anonymous` policies expose — the public catalog.
 */
export async function getSupabaseAnonymousClient(): Promise<DbClient> {
  const jwt = await getAnonymousJwt();
  if (!jwt) throw new Error("Neon Data API anonymous token is unavailable");
  return createDbClient(jwt);
}

export type SupabaseServerClient = DbClient;
