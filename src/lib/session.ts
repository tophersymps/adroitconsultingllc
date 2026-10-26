/**
 * src/lib/session.ts — canonical server-side user resolution.
 *
 * Single source of truth for "who is the signed-in user" on the server. It
 * reads the Managed Better Auth session (Neon Auth) through the SDK's
 * `next/headers` cookie adapter, so route handlers, server components and
 * pages all agree with `src/proxy.ts` and `/api/auth/session`.
 *
 * Guests resolve to `null` — never throw. A broken/unreachable auth backend
 * must degrade to "guest" for READS (the gates then redirect), while WRITES
 * are gated by their own explicit 401 checks.
 *
 * NOTE: the remaining Supabase data client (`src/lib/supabase/*`) is still in
 * place for the PostgREST reads until the Phase 3 data-client swap. Those
 * call sites must resolve the user HERE, not via `supabase.auth.getUser()`.
 */
/**
 * Imported lazily: `@/lib/auth/server` pulls in the SDK's Next adapter, which
 * imports `next/headers`. Unit tests and any module that merely imports
 * `@/lib/access` should not have to load that graph — only an actual session
 * read at request time does.
 */

import { isSecureRequest, type HeaderReader } from "@/lib/auth/transport";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Session cookie name, mirrored from the SDK's `NEON_AUTH_SESSION_COOKIE_NAME`
 * (`__Secure-neon-auth.session_token`).
 *
 * Duplicated on purpose: the guest fast path must decide "no cookie ⇒ no
 * session" WITHOUT importing the SDK, and the cookie name is the only fact it
 * needs. `session.test.ts` pins this literal against the SDK's exported
 * constant so the two cannot drift apart silently.
 */
export const SESSION_COOKIE_NAME = "__Secure-neon-auth.session_token";

/**
 * Same cookie under its plain-http name. On https (and on loopback) the SDK's
 * `__Secure-`-prefixed name is used; on plain http over a non-loopback host
 * browsers reject a `__Secure-` cookie unless it carries `Secure`, so the
 * session is stored unprefixed instead (see `src/lib/auth/transport.ts`).
 *
 * Only ONE of the two is accepted per request, chosen by `isSecureRequest()`
 * (M2, t_7ecb98d7): accepting the plain name on https would let a sibling
 * subdomain plant it under a registrable-domain cookie scope and be read as a
 * session token (session fixation, CWE-384).
 */
export const PLAIN_SESSION_COOKIE_NAME = "neon-auth.session_token";

/**
 * The session cookie name that is valid on this transport, or the `__Secure-`
 * form when no request header scope is available (a unit-test stub that mocks
 * only `cookies`, and any non-request caller — both want the deployed form).
 *
 * Only the cookie name that is valid on this transport counts (M2,
 * t_7ecb98d7): the plain name on https is a planting vector, and the
 * `__Secure-` name on plain http would have been dropped by the browser.
 */
function sessionCookieNameForRequest(headers: HeaderReader | null): string {
  if (!headers) return SESSION_COOKIE_NAME;
  return isSecureRequest(headers) ? SESSION_COOKIE_NAME : PLAIN_SESSION_COOKIE_NAME;
}

/**
 * Whether the CURRENT request presented a Managed Better Auth session cookie.
 *
 * This is the "did the caller claim an identity" predicate, deliberately kept
 * separate from "who is the caller": it reads `next/headers` only and performs
 * NO network call, so it answers in microseconds even while the auth backend
 * is throttling every mint. Presence is not validity — an expired or revoked
 * cookie is still a credential, and a caller that presented one must never be
 * answered as an anonymous guest (fail-closed contract for GET
 * /api/db/token; docs/decisions/2026-10-26-db-token-fail-closed-contract.md).
 *
 * Do NOT replace this with `getNeonSessionUser()`/`getSessionUser()`: those
 * return null for guests AND for an unreachable `/get-session`, which is the
 * exact ambiguity this predicate exists to remove.
 */
export async function hasSessionCredential(): Promise<boolean> {
  try {
    const nextHeaders = await import("next/headers");
    const cookieStore = await nextHeaders.cookies();
    return cookieStore.has(
      sessionCookieNameForRequest(await readRequestHeaders(nextHeaders)),
    );
  } catch {
    // Outside a request scope (static build pass, script): no credential.
    return false;
  }
}

/**
 * `next/headers`'s `headers()` when the module actually exposes it.
 *
 * The lookup is guarded twice on purpose: a unit-test `vi.mock` that exports
 * only `cookies` THROWS on property access to any other export, so "does this
 * module have `headers`?" cannot be asked with a bare `typeof`. A missing
 * header scope means "use the deployed (`__Secure-`) cookie name".
 */
async function readRequestHeaders(
  nextHeaders: Awaited<typeof import("next/headers")>,
): Promise<HeaderReader | null> {
  try {
    const read = nextHeaders.headers;
    return typeof read === "function" ? await read() : null;
  } catch {
    return null;
  }
}

/** How a failed session read failed. Values go to logs, never to a response. */
export type SessionReadErrorClass = "network" | "http" | "malformed";

export interface SessionReadFailure {
  errorClass: SessionReadErrorClass;
  /** Upstream HTTP status when there was one. Absent for transport failures. */
  status?: number;
  /** Seconds from an upstream retry hint (`x-retry-after`/`Retry-After`). */
  retryAfterSeconds?: number;
}

/**
 * Strict read outcome.
 *
 * `ok: true, user: null` means "the auth backend answered, and this request is
 * signed out" — a definitive identity fact. `ok: false` means "we could not
 * find out"; callers must NOT translate that into a signed-out state.
 */
export type SessionReadResult =
  | { ok: true; user: SessionUser | null }
  | { ok: false; failure: SessionReadFailure };

/** Pull a numeric HTTP status out of whatever the SDK threw/returned. */
function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    status?: unknown;
    cause?: { status?: unknown };
    response?: { status?: unknown };
  };
  for (const value of [
    candidate.status,
    candidate.cause?.status,
    candidate.response?.status,
  ]) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

/**
 * Pull an upstream retry hint out of the error, if the SDK surfaced one.
 *
 * The bundled `getSession()` collapses the upstream response into
 * `{ data, error }` and does NOT retain the raw `x-retry-after` header. This
 * helper honours the hint when an error carries one (a future SDK release, a
 * custom adapter, or a test seam); when it cannot be observed the route simply
 * omits `Retry-After` rather than inventing a value. The clamp matches the
 * token contract's reader (1–120 s).
 */
function retryAfterOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    retryAfterSeconds?: unknown;
    retryAfter?: unknown;
    headers?: unknown;
    response?: { headers?: unknown };
  };
  const raw = candidate.retryAfterSeconds ?? candidate.retryAfter;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.max(Math.ceil(raw), 1), 120);
  }
  for (const headers of [candidate.headers, candidate.response?.headers]) {
    if (!headers) continue;
    let value: string | null = null;
    if (headers instanceof Headers) {
      value = headers.get("x-retry-after") ?? headers.get("retry-after");
    } else if (typeof headers === "object") {
      const record = headers as Record<string, unknown>;
      const found =
        record["x-retry-after"] ?? record["retry-after"] ?? record["X-Retry-After"];
      if (typeof found === "string") value = found;
      else if (typeof found === "number" && Number.isFinite(found)) value = String(found);
    }
    if (!value) continue;
    const seconds = Number.parseInt(value, 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(Math.max(seconds, 1), 120);
    }
  }
  return undefined;
}

/**
 * Strict session read: performs the upstream `get-session` call and classifies
 * the outcome. NEVER throws — transport failures, 429s, 5xx and malformed
 * responses come back as `{ ok: false, failure }` so the route can answer 503.
 *
 * A 401/403 from the auth backend is a per-identity answer ("this session is
 * no longer valid"), so it maps to `{ ok: true, user: null }` — the caller may
 * treat it as signed out. Every other non-2xx, and every transport failure, is
 * an availability failure: we do not know who the caller is.
 *
 * Emits exactly ONE structured, identity-free log line per failure:
 *   { event: "session_read_failed", errorClass, status? }
 */
export async function readSessionUser(): Promise<SessionReadResult> {
  let failure: SessionReadFailure | undefined;

  try {
    const { getAuthServer } = await import("@/lib/auth/server");
    const result = await getAuthServer().getSession();
    const error = result?.error as
      | {
          status?: number;
          message?: string;
          code?: string;
          headers?: unknown;
          retryAfterSeconds?: number;
        }
      | null
      | undefined;

    if (error) {
      const status = typeof error.status === "number" ? error.status : undefined;
      // A revoked/expired session is an identity fact, not an outage: the
      // backend answered "not signed in". Keep the forgiving contract for
      // 401/403 so an expired cookie still renders as signed-out.
      if (status === 401 || status === 403) {
        return { ok: true, user: null };
      }
      const retryAfterSeconds = retryAfterOf(error);
      failure = {
        errorClass: status === undefined ? "network" : "http",
        ...(status === undefined ? {} : { status }),
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      };
    } else {
      const user = result?.data?.user;
      if (!user?.id) return { ok: true, user: null };
      return {
        ok: true,
        user: {
          id: user.id,
          email: user.email ?? "",
          name: user.name ?? null,
        },
      };
    }
  } catch (err) {
    const status = statusOf(err);
    if (status === 401 || status === 403) return { ok: true, user: null };
    const retryAfterSeconds = retryAfterOf(err);
    failure = {
      errorClass: status === undefined ? "network" : "http",
      ...(status === undefined ? {} : { status }),
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    };
  }

  const resolved = failure ?? { errorClass: "malformed" as const };
  // One structured line per failure; no cookie, token, host or email. The
  // errorClass/status vocabulary matches the /api/db/token contract so
  // dashboards can classify both endpoints the same way.
  console.error({
    event: "session_read_failed",
    errorClass: resolved.errorClass,
    ...(resolved.status === undefined ? {} : { status: resolved.status }),
  });
  return { ok: false, failure: resolved };
}

/**
 * Current session user, or null for guests / on any auth error.
 * Shape is intentionally minimal: only what the app needs (id, email, name).
 *
 * GUEST FAST PATH (perf P2, review of t_d3c401c9): `/api/auth/session` is
 * called on every page load (`src/hooks/useAuth.ts`), and the SDK's
 * `getSession()` only consults the signed session-data cookie cache when BOTH
 * the session token cookie and the session-data cookie are present. With
 * neither — i.e. every guest — it falls through to an upstream `get-session`
 * fetch (~40 ms locally vs ~3 ms before the R2-1 swap, plus a round trip to
 * the auth backend per anonymous pageview). So: no session cookie ⇒ guest,
 * decided from `next/headers` alone, before the SDK is even imported. This is
 * the same guard `src/proxy.ts` uses.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!(await hasSessionCredential())) return null;
  const result = await readSessionUser();
  return result.ok ? result.user : null;
}

/** Current session user id, or null for guests. */
export async function getSessionUserId(): Promise<string | null> {
  const user = await getSessionUser();
  return user?.id ?? null;
}
