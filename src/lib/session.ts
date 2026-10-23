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
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    if (!cookieStore.has(SESSION_COOKIE_NAME)) return null;

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
