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
 * This module has no dependencies, so importing it is free. (There is a test
 * that enforces "no imports" — keep it that way.)
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
 *
 * FAIL CLOSED ON THE ANSWER (contract §8, CWE-636/CWE-287). Only a `200`
 * populates the cache:
 *
 *   200 { token: "<jwt>" }  -> resolve the JWT, cache it
 *   200 { token: null }     -> resolve null (genuine guest), cache it
 *   401 SESSION_INVALID     -> drop the cache, resolve null (the UI re-auths)
 *   503 / fetch failure     -> drop the cache, REJECT classified
 *                              `DbTokenUnavailableError` and cache nothing
 *
 * A `503` must never become `null`: `@neondatabase/postgrest-js`
 * `fetchWithToken` turns a falsy token into `AuthRequiredError`, i.e. a
 * transient outage would be reported to a signed-in user as "you are signed
 * out". Rejecting is also what lets a hook show "try again in a moment"
 * instead of the guest view.
 */

/** Classified "the token endpoint could not answer" — retryable, not a guest. */
export class DbTokenUnavailableError extends Error {
  readonly code = "TOKEN_UNAVAILABLE";
  /** Seconds the server asked us to wait, when it advertised one. */
  readonly retryAfterSeconds?: number;

  constructor(retryAfterSeconds?: number) {
    super("Neon Data API token is unavailable");
    this.name = "DbTokenUnavailableError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Branded check — never a message-string match. */
export function isDbTokenUnavailableError(
  err: unknown,
): err is DbTokenUnavailableError {
  return (
    err instanceof DbTokenUnavailableError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { code?: unknown }).code === "TOKEN_UNAVAILABLE")
  );
}

let tokenPromise: Promise<string | null> | null = null;
let tokenFetchedAt = 0;
const TOKEN_TTL_MS = 60_000;

/** Epoch-ms before which we must not re-ask (server's `Retry-After` floor). */
let retryFloorUntil = 0;

/** Drop the cached token so the next request re-reads the session cookie. */
export function invalidateDbToken(): void {
  tokenPromise = null;
  tokenFetchedAt = 0;
  retryFloorUntil = 0;
}

/**
 * Alias with the name the R2-2 security review uses (SEC-R2-2-M3). Kept in
 * addition to `invalidateDbToken` because both names are already in call sites
 * and review notes; they are the same operation.
 */
export const resetDbTokenCache = invalidateDbToken;

function parseRetryAfter(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(Math.max(Math.round(value), 1), 120);
}

/** One request to `/api/db/token`, with the failure classification preserved. */
async function loadToken(): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch("/api/db/token", {
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    // Offline, aborted, TLS: an AVAILABILITY failure, not a guest identity.
    // Never resolved as null — that is `AuthRequiredError` upstream and a
    // "please sign in" prompt for a user who is already signed in.
    invalidateDbToken();
    throw new DbTokenUnavailableError();
  }

  if (res.status === 401) {
    // The session is gone (expired / revoked): drop the cache so the next read
    // re-asks, and report "no identity" by design. The UI prompts re-auth.
    invalidateDbToken();
    return null;
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { retryAfterSeconds?: unknown }
      | null;
    const retryAfterSeconds = parseRetryAfter(body?.retryAfterSeconds);
    invalidateDbToken();
    if (retryAfterSeconds !== undefined) {
      retryFloorUntil = Date.now() + retryAfterSeconds * 1000;
    }
    throw new DbTokenUnavailableError(retryAfterSeconds);
  }

  const body = (await res.json().catch(() => null)) as
    | { token?: unknown }
    | null;
  if (typeof body?.token === "string" && body.token.length > 0) {
    return body.token;
  }
  if (body !== null && body.token === null) {
    return null; // explicit guest: 200 { token: null }
  }
  // 200 with nothing usable is a protocol violation, not a guest.
  invalidateDbToken();
  throw new DbTokenUnavailableError();
}

/** Cached token provider handed to neon-js as `dataApi.getToken`. */
export async function getToken(): Promise<string | null> {
  const now = Date.now();
  if (tokenPromise && now - tokenFetchedAt < TOKEN_TTL_MS) return tokenPromise;

  // Honour the server's advertised wait instead of hammering a throttled mint.
  const waitMs = retryFloorUntil - now;
  if (waitMs > 0) {
    throw new DbTokenUnavailableError(Math.ceil(waitMs / 1000));
  }

  const pending = loadToken();
  tokenPromise = pending;
  tokenFetchedAt = now;
  try {
    return await pending;
  } catch (err) {
    // A failure is never memoised for the TTL: only a successful answer stays
    // cached, so the very next read re-asks (contract §8, C1/C4).
    if (tokenPromise === pending) tokenPromise = null;
    throw err;
  }
}
