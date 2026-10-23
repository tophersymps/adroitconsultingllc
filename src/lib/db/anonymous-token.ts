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
      errorClass?: "http" | "network" | "malformed";
      retryAfterSeconds?: number;
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

    if (res.ok) {
      // The serving deadline is capped at 55 min, then pulled back by the
      // 5 min safety margin and 0–120 s of jitter (so instances that minted
      // together do not all refresh together). The hard stop stays at the
      // token's own `exp` (also capped) — nothing is ever served past it.
      const capMs = Math.min(res.expiresAtMs - now, MAX_TTL_MS);
      const expiresAtMs = now + Math.max(capMs, MIN_TTL_MS);
      const freshUntilMs = Math.min(
        now + Math.max(capMs - SAFETY_MS - jitter(120_000), MIN_TTL_MS),
        expiresAtMs,
      );
      entry = { token: res.token, freshUntilMs, expiresAtMs };
      anonTokenStats.mints++;
      return { ok: true, token: entry.token, expiresAtMs: entry.expiresAtMs };
    }

    // Failed mint → classify, suppress, and fall back to a still-valid token.
    anonTokenStats.failures++;
    lastFailure = res;
    if (res.status === 429) anonTokenStats.throttled++;

    const wait =
      clamp(res.retryAfterSeconds ?? 10, MIN_SUPPRESS_MS / 1000, MAX_SUPPRESS_MS / 1000) *
        1000 +
      jitter(5_000);
    suppressedUntil = now + wait;

    // Observability without secrets (S-6/S-8): status + class + timing only.
    // Emitted once per failed mint, not once per request.
    console.warn("[db] token unavailable", {
      tokenPath: "/token/anonymous",
      status: res.status ?? null,
      errorClass: res.errorClass ?? "http",
      retryAfterSeconds: res.retryAfterSeconds ?? null,
      suppressedForMs: wait,
      timestamp: new Date(now).toISOString(),
    });

    if (entry && entry.expiresAtMs > now) {
      anonTokenStats.servedStale++;
      return { ok: true, token: entry.token, expiresAtMs: entry.expiresAtMs };
    }
    return res;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
