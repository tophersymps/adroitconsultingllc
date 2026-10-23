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

/**
 * Thrown by the Data API client factory when Neon Auth refuses to mint ANY
 * bearer token for this request (t_223f8b3d, digest 307487673).
 *
 * The Data API has no service key: a client with no `Authorization` header is
 * not "anonymous", it is a hard 400 (`missing authentication credentials`)
 * that escapes the RSC render as a 500. Callers on READ paths catch THIS type
 * and degrade to the guest/empty state; anything else still fails loudly.
 */
export class DbAuthUnavailableError extends Error {
  readonly code = "DB_AUTH_UNAVAILABLE";
  constructor(
    message = "Neon Auth did not mint a Data API JWT for this request",
  ) {
    super(message);
    this.name = "DbAuthUnavailableError";
  }
}

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

/** A mint request is bounded so a hung auth backend cannot hang the render. */
const TOKEN_TIMEOUT_MS = 2500;

/**
 * Mint a Data API JWT. Returns null — never throws — when the endpoint is
 * throttled, refuses, times out or answers garbage: the caller decides how to
 * degrade. Only the endpoint path and the HTTP status are ever logged; a token
 * or a cookie value must never reach a log line (t_52f55ea7).
 */
async function fetchToken(
  path: string,
  options: { withCookie: boolean },
): Promise<string | null> {
  // The anonymous mint must never see the caller's session cookie: one
  // identity's credentials must not be presented on another identity's mint.
  const cookie = options.withCookie ? await requestCookieHeader() : null;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;

  // Resolved OUTSIDE the try: a missing endpoint env is a misconfiguration and
  // must throw loudly (fail closed), not masquerade as a mint outage.
  const base = authBaseUrl();

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch {
    // Network error / abort — same degrade as a refusal.
    console.warn("[db] token mint unavailable", {
      event: "db_token_unavailable",
      path,
      status: null,
    });
    return null;
  }
  if (!res.ok) {
    console.warn("[db] token mint refused", {
      event: "db_token_unavailable",
      path,
      status: res.status,
    });
    return null;
  }
  const body = (await res.json().catch(() => null)) as { token?: unknown } | null;
  return typeof body?.token === "string" && body.token.length > 0
    ? body.token
    : null;
}

/**
 * The signed-in caller's Data API JWT, or null for guests.
 *
 * Skipped entirely when the request carries no cookie: `/token` can only
 * answer 401 in that case, and burning the per-IP mint bucket on every guest
 * render is what empties it for signed-in renders too (t_223f8b3d).
 */
export const getSessionJwt = cache(async (): Promise<string | null> => {
  const cookie = await requestCookieHeader();
  if (!cookie) return null;
  return fetchToken("/token", { withCookie: true });
});

/** The `anonymous` role's JWT — used when nobody is signed in. */
const getAnonymousJwt = cache((): Promise<string | null> =>
  fetchToken("/token/anonymous", { withCookie: false }),
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

function createDbClient(jwt: string): DbClient {
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
 *
 * FAIL CLOSED (t_223f8b3d): a bearer-less client cannot be constructed. When
 * neither the session nor the anonymous mint yields a JWT the factory throws
 * `DbAuthUnavailableError`, and read paths degrade to their guest/empty state
 * instead of letting the Data API's 400 escape the render as a 500.
 */
export const getSupabaseServerClient = cache(
  async (): Promise<DbClient> => {
    const jwt = (await getSessionJwt()) ?? (await getAnonymousJwt());
    if (!jwt) throw new DbAuthUnavailableError();
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
