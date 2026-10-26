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
import { hasSessionCredential } from "@/lib/session";

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
 * Whole seconds until a local wait ends, clamped to the range the failure
 * contract advertises (`Retry-After`: 1..120). Rounds UP so a caller is never
 * told to retry earlier than the cooldown actually allows.
 */
function retryAfterFromMs(ms: number): number {
  return Math.min(Math.max(Math.ceil(ms / 1000), 1), 120);
}

/**
 * TOTAL mint budget for ONE request, shared by the session mint, the anonymous
 * fallback and the `/get-session` lookup (t_7037d35a perf MEDIUM, t_81b09ba8).
 *
 * Neither fetch had an `AbortSignal` on main: a HUNG (not failing) auth backend
 * blocked the render unbounded, and because `getSupabaseServerClient()` mints
 * the session token and then the anonymous one, the cost was paid twice. A
 * healthy mint is tens of milliseconds, so one shared deadline costs the
 * healthy path nothing and caps the degraded path once.
 */
const MINT_BUDGET_MS = 800;

/**
 * How long a mint path stays on the negative cache after it failed in a way
 * that means "the endpoint is unhealthy" (no answer inside the budget, network
 * error, 429, 5xx). Without this, every concurrent render during an outage
 * re-paid the whole budget against an endpoint that is already struggling.
 *
 * Keyed by endpoint path, holds no identity and no token, and NEVER records a
 * success (a success always clears it) nor a 401/403 — those are per-identity
 * answers that cost nothing to retry on the next render.
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
 * The ONE mint deadline this request may spend, shared by both mints and the
 * session lookup. `cache()` makes it per-request (a page issuing many reads
 * spends it once).
 */
const requestMintDeadline = cache((): number => Date.now() + MINT_BUDGET_MS);

/**
 * Resolve a token from the Managed Better Auth token route.
 *
 * NEVER rejects for an HTTP/network/malformed outcome — those are returned as
 * `ok: false` so a guest read degrades instead of throwing (the old
 * unguarded `fetch` here was one of the two 500 mechanisms). A MISSING
 * `NEON_AUTH_BASE_URL` still throws: a misconfigured runtime must fail closed,
 * never silently degrade.
 *
 * BOUNDED (t_81b09ba8): the fetch carries `AbortSignal.timeout(remaining)` for
 * the request's shared mint deadline, and an endpoint that burned the budget is
 * skipped for `MINT_COOLDOWN_MS` instead of re-asked by every render.
 */
async function fetchTokenResult(
  path: "/token" | "/token/anonymous",
  deadline: number,
): Promise<AnonTokenResult> {
  const base = authBaseUrl(); // fail closed on missing env (outside the try)
  const headers: Record<string, string> = { Accept: "application/json" };
  // The caller's httpOnly session cookie is the ONLY way user identity enters
  // this module, so it is sent to `/token` alone. `/token/anonymous` needs no
  // caller identity, and the token it returns is cached process-wide
  // (./anonymous-token) — minting that shared credential with a specific
  // user's cookie attached is exactly how user context could leak into it
  // (SEC-R2-5-L1). Never attach it there.
  if (path === "/token") {
    const cookie = await requestCookieHeader();
    if (cookie) headers.Cookie = cookie;
  }

  // The endpoint burned the budget moments ago: do not spend the render's
  // remaining budget re-asking it (t_81b09ba8). Reported as a failed mint, so
  // the caller degrades exactly as it would on a network error.
  //
  // `cooldownRemainingMs`/`retryAfterSeconds` are carried so a fail-closed
  // caller (GET /api/db/token) can emit an honest `Retry-After` instead of
  // telling the user to retry immediately into the same cooldown.
  const cooldownMs = cooldownRemainingMs(path);
  if (cooldownMs > 0) {
    return {
      ok: false,
      errorClass: "network",
      cooldownRemainingMs: cooldownMs,
      retryAfterSeconds: retryAfterFromMs(cooldownMs),
    };
  }

  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    // The request's mint budget is already spent. Another round trip would
    // only lengthen the render against an endpoint that is not answering.
    markMintUnavailable(path);
    return { ok: false, errorClass: "network" };
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
    markMintUnavailable(path);
    return { ok: false, errorClass: "network" };
  }

  if (!res.ok) {
    // 401/403 are per-identity answers and cost nothing to retry next render;
    // 429/5xx mean the endpoint itself is unhealthy.
    if (res.status === 429 || res.status >= 500) markMintUnavailable(path);
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
  // The anonymous token is cached process-wide, so its scope must be PROVEN
  // before it can be used: only a decodable JWT whose `role` is exactly
  // `anonymous` is acceptable. Fail CLOSED — a role-less payload, a payload
  // with a user `sub` but no role, and an opaque non-JWT string are all
  // rejected as `malformed` (the route then degrades, never 500s).
  // SEC-R2-5-M1.
  if (path === "/token/anonymous") {
    const role = payload?.role;
    if (role !== "anonymous") {
      return { ok: false, status: res.status, errorClass: "malformed" };
    }
  }

  const exp = payload && typeof payload.exp === "number" ? payload.exp * 1000 : null;
  // A usable token proves the endpoint is healthy again: recover immediately.
  clearMintCooldown(path);
  return {
    ok: true,
    token,
    expiresAtMs: exp ?? Date.now() + FALLBACK_TTL_MS,
  };
}

/**
 * The signed-in caller's Data API JWT, or null for guests. Per-request only
 * (React `cache`): a session token is NEVER cached across requests/users.
 *
 * Kept for compatibility — it is a lossy projection of the classified mint
 * below. Anything that has to distinguish "no session" from "the mint failed"
 * (i.e. GET /api/db/token) must use `getSessionTokenResult()` instead: this
 * wrapper is exactly the collapse the fail-closed contract removes.
 */
async function mintSessionJwt(deadline: number): Promise<string | null> {
  const result = await mintSessionResult(deadline);
  return result.ok ? result.token : null;
}

/**
 * The session mint WITH its classification intact (`errorClass`, `status`,
 * `retryAfterSeconds`, `cooldownRemainingMs`).
 *
 * Throws only for a missing `NEON_AUTH_BASE_URL` — a misconfigured runtime must
 * fail closed rather than degrade, exactly like `getSupabaseServerClient()`
 * already does. Route callers that must answer an opaque 503 use
 * `getSessionTokenResult()`, which converts that throw to `errorClass:"config"`.
 */
async function mintSessionResult(deadline: number): Promise<AnonTokenResult> {
  return fetchTokenResult("/token", deadline);
}

/**
 * Classified version of `getSessionJwt()` for the token route: never rejects,
 * so the route can branch on the mint's classification instead of on a
 * `try/catch` around a value that has already lost it.
 */
export async function getSessionTokenResult(): Promise<AnonTokenResult> {
  try {
    return await mintSessionResult(requestMintDeadline());
  } catch {
    // authBaseUrl() refused → missing NEON_AUTH_BASE_URL. Opaque 503 at the
    // edge; the diagnosis lives in the log line, not the response body.
    return { ok: false, errorClass: "config" };
  }
}

export const getSessionJwt = cache(
  async (): Promise<string | null> => mintSessionJwt(requestMintDeadline()),
);

/**
 * The `anonymous` role's JWT — used when nobody is signed in. Backed by the
 * cross-request cache in ./anonymous-token (TTL from `exp`, single-flight,
 * circuit breaker). Returns null when no token is available; callers then use
 * the classified degraded client instead of issuing a bare request.
 */
async function getAnonymousJwt(deadline: number): Promise<string | null> {
  // The caller passes the request's ONE deadline: when the anonymous token is
  // already cached this fetch never happens, so a page spends nothing on it,
  // and when the session mint burned the budget the anonymous fallback is not
  // granted a second one (t_81b09ba8).
  const result = await getAnonymousJwtResult(() =>
    fetchTokenResult("/token/anonymous", deadline),
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
    // t_81b09ba8: bounded like the mints — the same request budget. A hung
    // `/get-session` must not outlive the render, and a caller that already
    // spent the budget minting tokens degrades instead of waiting again.
    const remaining = requestMintDeadline() - Date.now();
    if (remaining <= 0) return null;
    try {
      const res = await fetch(`${authBaseUrl()}/get-session`, {
        headers: { Cookie: cookie, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(remaining),
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
 * ALWAYS resolves (R2-5 AC-1): when no usable JWT can be resolved, the caller
 * gets a classified degraded client instead of a rejection — a guest page must
 * render, never 500.
 *
 * FAIL CLOSED ON THE ROLE (CWE-636/CWE-863, fail-closed contract §9): the
 * decision to read as the Postgres `anonymous` role is made from credential
 * PRESENCE, never from a failed mint. A request that presented a session cookie
 * and whose mint failed gets the degraded client — never the anonymous JWT. The
 * old `mintSessionJwt() ?? getAnonymousJwt()` shape was reachable from a failed
 * session mint and served 48 call sites the wrong role's data.
 */
export const getSupabaseServerClient = cache(
  async (): Promise<DbClient> => {
    // ONE deadline for the whole request: a session mint that hung must not be
    // followed by a second full-budget attempt against the anonymous endpoint
    // (t_81b09ba8). `getSessionJwt` is not reused here because it would create
    // its own deadline (React `cache()` does not memoise outside a render).
    const deadline = requestMintDeadline();
    // Presence, not validity, and no network call: an unreachable /get-session
    // must not be mistaken for "this is a guest".
    if (await hasSessionCredential()) {
      const session = await mintSessionResult(deadline);
      // A missing endpoint env throws here (fail closed), as before.
      return session.ok ? createDbClient(session.token) : createDegradedDbClient();
    }
    const anonymousJwt = await getAnonymousJwt(deadline);
    return anonymousJwt ? createDbClient(anonymousJwt) : createDegradedDbClient();
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
  const jwt = await getAnonymousJwt(requestMintDeadline());
  return jwt ? createDbClient(jwt) : createDegradedDbClient();
}

export type SupabaseServerClient = DbClient;
