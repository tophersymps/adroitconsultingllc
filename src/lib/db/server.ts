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

/**
 * TOTAL mint budget for ONE request, shared by the session mint and the
 * anonymous fallback (t_81b09ba8).
 *
 * Bounding each call was not enough: `getSupabaseServerClient()` mints the
 * session JWT and then, on failure, the anonymous one — sequentially. With a
 * per-call 2.5 s timeout a HUNG (not failing) auth backend cost 2.5 s per
 * guest render and 5.0 s per signed-in render, for every render, for the whole
 * outage window. A healthy mint is tens of milliseconds, so one shared
 * deadline costs the healthy path nothing and caps the degraded path once.
 */
const MINT_BUDGET_MS = 800;

/**
 * How long a mint path stays on the negative cache after it failed in a way
 * that means "the endpoint is unhealthy" (no answer inside the budget, network
 * error, 429, 5xx). Without this, every concurrent render during an outage
 * re-paid the whole budget against an endpoint that is already struggling.
 *
 * Keyed by endpoint path, holds no identity and no token, and NEVER records a
 * success — a healthy mint always goes to the network.
 */
const MINT_COOLDOWN_MS = 8000;

/** path → epoch-ms until which that mint path is skipped. */
const mintCooldownUntil = new Map<string, number>();

/** Test-only: drop the module-scope negative cache between cases. */
export function __resetMintCooldown(): void {
  mintCooldownUntil.clear();
}

function cooldownRemainingMs(path: string): number {
  const until = mintCooldownUntil.get(path);
  if (until === undefined) return 0;
  const remaining = until - Date.now();
  if (remaining <= 0) {
    mintCooldownUntil.delete(path);
    return 0;
  }
  return remaining;
}

function markMintUnavailable(path: string): void {
  // Only the two mint paths ever reach here; the bound is defensive so a
  // future caller cannot grow this map without bound.
  if (mintCooldownUntil.size > 8) mintCooldownUntil.clear();
  mintCooldownUntil.set(path, Date.now() + MINT_COOLDOWN_MS);
}

/** A success proves the endpoint is healthy again: recover immediately. */
function clearMintCooldown(path: string): void {
  mintCooldownUntil.delete(path);
}

/**
 * Why a mint produced no token. `unavailable` means the endpoint did not
 * ANSWER — it hung past the budget, the network failed, or it is on the
 * negative cache from such a failure — as opposed to answering "no"
 * (401/403: an expired or absent session). The caller uses it to decide
 * whether retrying the sibling endpoint is worth another round trip.
 */
interface MintOutcome {
  token: string | null;
  unavailable: boolean;
}

/**
 * Mint a Data API JWT. Returns no token — never throws — when the endpoint is
 * throttled, refuses, times out or answers garbage: the caller decides how to
 * degrade. Only the endpoint path and the HTTP status are ever logged; a token
 * or a cookie value must never reach a log line (t_52f55ea7).
 */
async function fetchToken(
  path: string,
  options: { withCookie: boolean; deadline: number },
): Promise<MintOutcome> {
  // The endpoint burned the budget moments ago: do not spend the render's
  // remaining budget re-asking it (t_81b09ba8). Reported as `unavailable` so
  // a caller does not immediately retry its sibling endpoint either — both
  // were failing together when this entry was recorded.
  if (cooldownRemainingMs(path) > 0) return { token: null, unavailable: true };

  // The anonymous mint must never see the caller's session cookie: one
  // identity's credentials must not be presented on another identity's mint.
  const cookie = options.withCookie ? await requestCookieHeader() : null;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;

  // Resolved OUTSIDE the try: a missing endpoint env is a misconfiguration and
  // must throw loudly (fail closed), not masquerade as a mint outage.
  const base = authBaseUrl();

  const remaining = options.deadline - Date.now();
  if (remaining <= 0) {
    // The request's mint budget is already spent. Another round trip would
    // only lengthen the render against an endpoint that is not answering.
    markMintUnavailable(path);
    return { token: null, unavailable: true };
  }

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(remaining),
    });
  } catch {
    // Network error / abort — same degrade as a refusal, plus a cooldown: the
    // endpoint is either unreachable or too slow to be worth re-asking.
    console.warn("[db] token mint unavailable", {
      event: "db_token_unavailable",
      path,
      status: null,
    });
    markMintUnavailable(path);
    return { token: null, unavailable: true };
  }
  if (!res.ok) {
    console.warn("[db] token mint refused", {
      event: "db_token_unavailable",
      path,
      status: res.status,
    });
    // 401/403 are per-identity answers and cost nothing to retry next render;
    // 429/5xx mean the endpoint itself is unhealthy.
    if (res.status === 429 || res.status >= 500) markMintUnavailable(path);
    return { token: null, unavailable: false };
  }
  const body = (await res.json().catch(() => null)) as { token?: unknown } | null;
  const token =
    typeof body?.token === "string" && body.token.length > 0 ? body.token : null;
  if (token) clearMintCooldown(path);
  return { token, unavailable: false };
}

/**
 * The ONE mint deadline this request may spend, shared by both mints.
 * `cache()` makes it per-request (a page issuing many reads spends it once).
 */
const requestMintDeadline = cache((): number => Date.now() + MINT_BUDGET_MS);

/** The signed-in caller's mint. Skipped when there is no cookie to present. */
const sessionMint = cache(async (deadline: number): Promise<MintOutcome> => {
  // `/token` can only answer 401 without a cookie, and burning the per-IP mint
  // bucket on every guest render is what empties it for signed-in renders too
  // (t_223f8b3d).
  const cookie = await requestCookieHeader();
  // No cookie is NOT an outage: `/token` would only answer 401. The caller may
  // still fall through to the anonymous path (this is the guest render).
  if (!cookie) return { token: null, unavailable: false };
  return fetchToken("/token", { withCookie: true, deadline });
});

/** The `anonymous` role's mint — used when nobody is signed in. */
const anonymousMint = cache((deadline: number): Promise<MintOutcome> =>
  fetchToken("/token/anonymous", { withCookie: false, deadline }),
);

/**
 * The signed-in caller's Data API JWT, or null for guests.
 * Kept as a thin wrapper for `/api/db/token`, which needs the token itself.
 */
export const getSessionJwt = cache(
  async (): Promise<string | null> =>
    (await sessionMint(requestMintDeadline())).token,
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
 *
 * BUDGETED (t_81b09ba8): both mints share ONE deadline, so the worst case for
 * a hung auth backend is one budget per render rather than one per endpoint.
 * A session mint that did not ANSWER (hung, network error, or already on the
 * negative cache) is not retried against `/token/anonymous` — re-asking a dead
 * backend immediately is exactly what doubled the cost — but a refusal (401 on
 * an expired session) still falls back to the guest path.
 */
export const getSupabaseServerClient = cache(
  async (): Promise<DbClient> => {
    const deadline = requestMintDeadline();

    const session = await sessionMint(deadline);
    let jwt = session.token;
    if (!jwt && !session.unavailable) {
      jwt = (await anonymousMint(deadline)).token;
    }

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
  const jwt = (await anonymousMint(Date.now() + MINT_BUDGET_MS)).token;
  if (!jwt) throw new Error("Neon Data API anonymous token is unavailable");
  return createDbClient(jwt);
}

export type SupabaseServerClient = DbClient;
