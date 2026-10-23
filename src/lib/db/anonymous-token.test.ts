/**
 * src/lib/db/anonymous-token.test.ts — the cross-request anonymous-token cache
 * (R2-5, AC-13 + the design's §4.1 algorithm).
 *
 * These are unit tests of the cache policy with an injected minter, so no
 * network and no credentials are involved:
 *
 *   - TTL is derived from the token's own `exp`, capped at 55 min;
 *   - a hit within the TTL does not re-mint;
 *   - a token is refreshed 5 min before `exp`;
 *   - a failed mint suppresses further mints for `x-retry-after` (+ jitter),
 *     which is a circuit breaker, NOT a retry;
 *   - stale-while-error keeps serving a still-unexpired token;
 *   - a token past `exp` is never served.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  anonTokenStats,
  getAnonymousJwtResult,
  resetAnonymousTokenCacheForTests,
  type AnonTokenResult,
} from "./anonymous-token";

const NOW = Date.UTC(2026, 9, 23, 18, 0, 0);

function okToken(expiresInMs: number, token = "anon.jwt.token"): AnonTokenResult {
  return { ok: true, token, expiresAtMs: NOW + expiresInMs };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // Deterministic jitter so TTL/suppression bounds are assertable.
  vi.spyOn(Math, "random").mockReturnValue(0);
  resetAnonymousTokenCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("anonymous token cache", () => {
  it("mints once, then serves the cached token within the TTL", async () => {
    const mint = vi.fn(async () => okToken(60 * 60_000));

    const first = await getAnonymousJwtResult(mint);
    vi.advanceTimersByTime(10 * 60_000);
    const second = await getAnonymousJwtResult(mint);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(mint).toHaveBeenCalledTimes(1);
    expect(anonTokenStats.mints).toBe(1);
    expect(anonTokenStats.hits).toBe(1);
  });

  it("caps the cached lifetime at 55 min even when exp is an hour away", async () => {
    const mint = vi.fn(async () => okToken(60 * 60_000));
    await getAnonymousJwtResult(mint);

    // 56 min later the entry has expired → a second mint.
    vi.advanceTimersByTime(56 * 60_000);
    await getAnonymousJwtResult(mint);

    expect(mint).toHaveBeenCalledTimes(2);
  });

  it("refreshes 5 minutes before exp", async () => {
    const mint = vi.fn(async () => okToken(10 * 60_000));
    await getAnonymousJwtResult(mint);

    // TTL = 10 min - 5 min safety = 5 min (minus 0 jitter).
    vi.advanceTimersByTime(5 * 60_000 + 1_000);
    await getAnonymousJwtResult(mint);

    expect(mint).toHaveBeenCalledTimes(2);
  });

  it("never caches for less than a minute when exp is already near", async () => {
    const mint = vi.fn(async () => okToken(30_000));
    await getAnonymousJwtResult(mint);

    vi.advanceTimersByTime(20_000);
    await getAnonymousJwtResult(mint);

    // Floored at 60 s of freshness, so still a hit at 20 s.
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("single-flights concurrent misses", async () => {
    const mint = vi.fn(async () => okToken(60 * 60_000));

    const results = await Promise.all([
      getAnonymousJwtResult(mint),
      getAnonymousJwtResult(mint),
      getAnonymousJwtResult(mint),
      getAnonymousJwtResult(mint),
      getAnonymousJwtResult(mint),
    ]);

    expect(mint).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("suppresses further mints for x-retry-after after a 429 (circuit breaker, not a retry)", async () => {
    const mint = vi.fn(async (): Promise<AnonTokenResult> => ({
      ok: false,
      status: 429,
      errorClass: "http",
      retryAfterSeconds: 30,
    }));

    const first = await getAnonymousJwtResult(mint);
    expect(first.ok).toBe(false);

    vi.advanceTimersByTime(20_000);
    const second = await getAnonymousJwtResult(mint);
    expect(second.ok).toBe(false);
    expect(mint).toHaveBeenCalledTimes(1);
    expect(anonTokenStats.throttled).toBeGreaterThanOrEqual(2);

    // Past the suppression window (30 s + 0 jitter) a new mint is attempted.
    vi.advanceTimersByTime(11_000);
    await getAnonymousJwtResult(mint);
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it("clamps a missing retry-after to a 10 s minimum suppression", async () => {
    const mint = vi.fn(async (): Promise<AnonTokenResult> => ({
      ok: false,
      status: 500,
      errorClass: "http",
    }));

    await getAnonymousJwtResult(mint);
    vi.advanceTimersByTime(5_000);
    await getAnonymousJwtResult(mint);
    expect(mint).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(6_000);
    await getAnonymousJwtResult(mint);
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it("serves a still-unexpired token when a refresh fails (stale-while-error)", async () => {
    let fail = false;
    const mint = vi.fn(async (): Promise<AnonTokenResult> =>
      fail
        ? { ok: false, status: 429, errorClass: "http", retryAfterSeconds: 60 }
        : okToken(8 * 60_000, "stale-but-valid"),
    );

    await getAnonymousJwtResult(mint);

    // Past the refresh point (3 min: exp - 5 min safety, floored) but still
    // inside the token's own `exp` (8 min).
    fail = true;
    vi.advanceTimersByTime(4 * 60_000);

    const result = await getAnonymousJwtResult(mint);
    expect(result.ok).toBe(true);
    expect(result.ok && result.token).toBe("stale-but-valid");
    expect(anonTokenStats.servedStale).toBe(1);
  });

  it("refuses to serve a token past its exp", async () => {
    let fail = false;
    const mint = vi.fn(async (): Promise<AnonTokenResult> =>
      fail
        ? { ok: false, status: 429, errorClass: "http", retryAfterSeconds: 60 }
        : okToken(6 * 60_000),
    );

    await getAnonymousJwtResult(mint);

    fail = true;
    // Past both the hard stop and the token's own exp.
    vi.advanceTimersByTime(61 * 60_000);

    const result = await getAnonymousJwtResult(mint);
    expect(result.ok).toBe(false);
    expect(anonTokenStats.servedStale).toBe(0);
  });

  it("classifies a network failure without logging token material", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mint = vi.fn(async (): Promise<AnonTokenResult> => ({
      ok: false,
      errorClass: "network",
    }));

    await getAnonymousJwtResult(mint);

    const calls = warn.mock.calls.filter((c) => c[0] === "[db] token unavailable");
    expect(calls).toHaveLength(1);
    const serialised = JSON.stringify(calls);
    expect(serialised).not.toContain("Bearer");
    expect(serialised).not.toContain("Cookie");
    expect(serialised).toContain("\"errorClass\":\"network\"");
  });
});
