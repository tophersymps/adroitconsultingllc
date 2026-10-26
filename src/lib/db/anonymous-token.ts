/**
 * src/lib/db/anonymous-token.ts — cross-request cache for the `anonymous`-role
 * Data API JWT (R2-5).
 *
 * Why this exists: `${NEON_AUTH_BASE_URL}/token/anonymous` is rate-limited by
 * Managed Better Auth (~250 mints / 60 s per client, then a hard 60 s lockout
 * advertised as the non-standard `x-retry-after` header). Resolving a fresh
 * anonymous token per guest request therefore saturates the bucket — and the
 * bucket is SHARED with `/token`, so guest traffic also denies session-JWT
 * minting to signed-in users behind the same IP.
 *
 * The `anonymous` role token carries no user identity (RLS still runs as
 * Postgres role `anonymous`), so caching it across requests is safe. The
 * signed-in caller's session JWT is NOT handled here and is never cached
 * across requests — this module has no API that accepts one.
 *
 * Policy (per the R2-5 design):
 *   - TTL derived from the token's own `exp` claim, minus a 5 min safety
 *     margin, capped at 55 min, with 0–120 s of jitter so instances that
 *     minted together do not all expire together.
 *   - single-flight: concurrent misses share one mint.
 *   - stale-while-error: a failed refresh keeps serving the still-unexpired
 *     cached token.
 *   - circuit breaker: after a failed mint, no new mint for
 *     `x-retry-after` (clamped 10–60 s) + 0–5 s jitter. This is suppression,
 *     not retry — it adds zero requests to a bucket that is already throttled.
 *
 * Nothing here logs token material (S-6/S-8): the warn line carries a status,
 * an error class and a timestamp only.
 */
import "server-only";

/** A mint attempt's outcome. Never a rejection — see server.ts fetchTokenResult. */
export type AnonTokenResult =
  | { ok: true; token: string; expiresAtMs: number }
  | {
      ok: false;
      status?: number;
      /**
       * `config` is produced by the /api/db/token route's classified session
       * mint (missing `NEON_AUTH_BASE_URL`), never by this module — the
       * anonymous path still throws there so a misconfigured runtime cannot
       * degrade into a silent guest read. It is part of the shared result type
       * so both mints speak one vocabulary.
       */
      errorClass?: "http" | "network" | "malformed" | "config";
      retryAfterSeconds?: number;
      /** Set when the failure was a local cooldown short-circuit. */
      cooldownRemainingMs?: number;
    };

/** The last failure, kept so a suppressed caller can report a classified state. */
type AnonTokenFailure = Extract<AnonTokenResult, { ok: false }>;

/** Refresh 5 minutes before the JWT's own `exp`. */
const SAFETY_MS = 5 * 60_000;
/** Never cache longer than 55 minutes, whatever `exp` says. */
const MAX_TTL_MS = 55 * 60_000;
/** A cache entry must stay usable for at least this long to be worth keeping. */
const MIN_TTL_MS = 60_000;
/** Suppression window bounds after a failed mint. */
const MIN_SUPPRESS_MS = 10_000;
const MAX_SUPPRESS_MS = 60_000;

interface CacheEntry {
  token: string;
  /** Serving deadline (safety-margin + jitter already applied). */
  freshUntilMs: number;
  /** Hard stop: never serve a token past this (≤ `exp`, ≤ 55 min). */
  expiresAtMs: number;
}

let entry: CacheEntry | null = null;
let inFlight: Promise<AnonTokenResult> | null = null;
let suppressedUntil = 0;
let lastFailure: AnonTokenFailure = { ok: false, errorClass: "network" };

/**
 * Counters, exported for tests and (potentially) an ops readout. Plain mutable
 * object — never contains token material.
 */
export const anonTokenStats = {
  hits: 0,
  misses: 0,
  mints: 0,
  failures: 0,
  throttled: 0,
  servedStale: 0,
};

/** Test hook: clear the cache, the in-flight promise and the suppression. */
export function resetAnonymousTokenCacheForTests(): void {
  entry = null;
  inFlight = null;
  suppressedUntil = 0;
  lastFailure = { ok: false, errorClass: "network" };
  anonTokenStats.hits = 0;
  anonTokenStats.misses = 0;
  anonTokenStats.mints = 0;
  anonTokenStats.failures = 0;
  anonTokenStats.throttled = 0;
  anonTokenStats.servedStale = 0;
}

function jitter(maxMs: number): number {
  return Math.floor(Math.random() * maxMs);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Return the process-wide anonymous-role token, minting through `fetchAnon`
 * only when the cache is empty/expired and the circuit breaker is closed.
 *
 * `fetchAnon` MUST resolve (never reject) — server.ts's fetchTokenResult
 * converts every network/HTTP/malformed failure into an `ok: false` result.
 */
export async function getAnonymousJwtResult(
  fetchAnon: () => Promise<AnonTokenResult>,
): Promise<AnonTokenResult> {
  const now = Date.now();

  // 1. Fresh cached token → hit.
  if (entry && entry.freshUntilMs > now) {
    anonTokenStats.hits++;
    return { ok: true, token: entry.token, expiresAtMs: entry.expiresAtMs };
  }

  // 2. A mint is already in flight → share it (single-flight).
  if (inFlight) return inFlight;

  // 3. Circuit breaker: a recent mint failed, do not spend the shared bucket.
  if (now < suppressedUntil) {
    anonTokenStats.throttled++;
    if (entry && entry.expiresAtMs > now) {
      anonTokenStats.servedStale++;
      return { ok: true, token: entry.token, expiresAtMs: entry.expiresAtMs };
    }
    return lastFailure;
  }

  // 4. Mint once, shared by every concurrent caller.
  anonTokenStats.misses++;
  inFlight = (async (): Promise<AnonTokenResult> => {
    const res = await fetchAnon();
    // Nothing is ever served past the token's own `exp` (CWE-613, SEC-R2-5-L2):
    // the hard stop is `exp` itself, capped at 55 min, and NEVER floored above
    // it. A mint whose `exp` is already gone (capMs <= 0) is unusable — it is
    // classified as a failed mint so callers degrade instead of presenting a
    // dead credential from the process-wide cache.
    const capMs = res.ok ? Math.min(res.expiresAtMs - now, MAX_TTL_MS) : 0;

    if (res.ok && capMs > 0) {
      const expiresAtMs = now + capMs;
      // Serve until the refresh point (5 min safety margin, 0–120 s jitter),
      // floored at MIN_TTL_MS of usefulness but clamped to `exp` — so a token
      // minted close to its expiry is served only for what it has left.
      const freshUntilMs = Math.min(
        now + Math.max(capMs - SAFETY_MS - jitter(120_000), MIN_TTL_MS),
        expiresAtMs,
      );
      entry = { token: res.token, freshUntilMs, expiresAtMs };
      anonTokenStats.mints++;
      return { ok: true, token: entry.token, expiresAtMs: entry.expiresAtMs };
    }

    const failure: AnonTokenFailure = res.ok
      ? { ok: false, errorClass: "malformed" }
      : res;

    // Failed mint → classify, suppress, and fall back to a still-valid token.
    anonTokenStats.failures++;
    lastFailure = failure;
    if (failure.status === 429) anonTokenStats.throttled++;

    const wait =
      clamp(failure.retryAfterSeconds ?? 10, MIN_SUPPRESS_MS / 1000, MAX_SUPPRESS_MS / 1000) *
        1000 +
      jitter(5_000);
    suppressedUntil = now + wait;

    // Observability without secrets (S-6/S-8): status + class + timing only.
    // Emitted once per failed mint, not once per request.
    console.warn("[db] token unavailable", {
      tokenPath: "/token/anonymous",
      status: failure.status ?? null,
      errorClass: failure.errorClass ?? "http",
      retryAfterSeconds: failure.retryAfterSeconds ?? null,
      suppressedForMs: wait,
      timestamp: new Date(now).toISOString(),
    });

    if (entry && entry.expiresAtMs > now) {
      anonTokenStats.servedStale++;
      return { ok: true, token: entry.token, expiresAtMs: entry.expiresAtMs };
    }
    return failure;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
