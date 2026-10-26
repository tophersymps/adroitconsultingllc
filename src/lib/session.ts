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
 * answered as an anonymous guest (fail-closed contract for GET /api/db/token;
 * docs/decisions/2026-10-26-db-token-fail-closed-contract.md).
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
  try {
    if (!(await hasSessionCredential())) {
      return null;
    }

    const { getAuthServer } = await import("@/lib/auth/server");
    const { data } = await getAuthServer().getSession();
    const user = data?.user;
    if (!user?.id) return null;
    return {
      id: user.id,
      email: user.email ?? "",
      name: user.name ?? null,
    };
  } catch (err) {
    console.error("[session] getSession failed", err);
    return null;
  }
}

/** Current session user id, or null for guests. */
export async function getSessionUserId(): Promise<string | null> {
  const user = await getSessionUser();
  return user?.id ?? null;
}
