/**
 * src/lib/db/token-cache.ts — the browser-side Data API token cache.
 *
 * WHY THIS IS A SEPARATE MODULE FROM ./client: `client.ts` statically imports
 * `@neondatabase/neon-js` to build the PostgREST client, which pulls the whole
 * Neon SDK (~270 KB raw / ~76 KB gzip) into every route bundle that imports it.
 * The identity-change call sites — `Header` (every page), the login page and
 * `useAuth` — only ever need to DROP this cache; they never query the Data API.
 * Importing them from `./client` therefore put the Neon SDK on public routes
 * (/, /atlas, /tags) that ship no Data API code at all (perf-P1 on PR #361).
 * This module has no dependencies, so importing it is free.
 *
 * One in-flight token request per page is enough; cache it briefly.
 *
 * The time-based TTL is NOT identity-aware: a 60 s TTL on a guest `null` would
 * keep the client unauthenticated for up to a minute after sign-in, and a 60 s
 * TTL on a user JWT would keep sending it for up to a minute after sign-out.
 * Identity changes are therefore signalled explicitly and drop the cache:
 *
 *   1. sign-in / sign-out (login page, Header) — SEC-R2-2-M3(a)
 *   2. every auth-changed broadcast (notifyAuthChanged) plus window focus,
 *      which is where a stale identity is most likely to hide — M3(b)
 *   3. any 401 from the Data API (revoked or rotated JWT) — M3(c)
 *
 * The cache is identity-keyed *by construction*: it is only ever filled for the
 * identity the session cookie currently names, and every transition that can
 * change that identity clears it before the next read. The TTL only bounds
 * ordinary staleness (session refresh), never an identity change.
 */
let tokenPromise: Promise<string | null> | null = null;
let tokenFetchedAt = 0;
const TOKEN_TTL_MS = 60_000;

/** Drop the cached token so the next request re-reads the session cookie. */
export function invalidateDbToken(): void {
  tokenPromise = null;
  tokenFetchedAt = 0;
}

/**
 * Alias with the name the R2-2 security review uses (SEC-R2-2-M3). Kept in
 * addition to `invalidateDbToken` because both names are already in call sites
 * and review notes; they are the same operation.
 */
export const resetDbTokenCache = invalidateDbToken;

/** Cached token provider handed to neon-js as `dataApi.getToken`. */
export async function getToken(): Promise<string | null> {
  const now = Date.now();
  if (tokenPromise && now - tokenFetchedAt < TOKEN_TTL_MS) return tokenPromise;

  tokenFetchedAt = now;
  tokenPromise = fetch("/api/db/token", {
    credentials: "same-origin",
    cache: "no-store",
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json().catch(() => null)) as { token?: unknown } | null;
      return typeof body?.token === "string" && body.token.length > 0
        ? body.token
        : null;
    })
    .catch(() => null);

  return tokenPromise;
}
