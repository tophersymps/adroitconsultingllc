/**
 * src/lib/db/server.budget.test.ts — the mint BUDGET and NEGATIVE CACHE
 * (perf MEDIUM t_7037d35a, ported onto main's R2-5 seam by t_3b6d832e).
 *
 * The failure mode: neither `${NEON_AUTH_BASE_URL}/token`, `/token/anonymous`
 * nor `/get-session` carried an `AbortSignal`, so a HUNG (not failing) auth
 * backend blocked a render forever — and because the client factory mints the
 * session token and then the anonymous one, a signed-in render paid it twice.
 *
 * The contract pinned here:
 *   - one shared per-request mint deadline (~800 ms), applied as
 *     `AbortSignal.timeout`;
 *   - a session mint that burned the budget is NOT retried against the sibling
 *     anonymous endpoint inside the same request;
 *   - an unhealthy mint path is negative-cached for a few seconds, keyed by
 *     path only — and a 401/403 is NEVER cached, because that is a per-identity
 *     answer, not an outage;
 *   - a success clears the cache.
 *
 * These tests fail on `origin/main` (no signal, unbounded).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import {
  __resetMintCooldown,
  getNeonSessionUser,
  getSupabaseServerClient,
} from "./server";
import { resetAnonymousTokenCacheForTests } from "./anonymous-token";
import { isDbTokenUnavailable } from "./degraded-client";

const AUTH_BASE = "https://auth.test/neondb/auth";
const DATA_BASE = "https://data.test/neondb/rest/v1";

const SESSION_COOKIE = {
  name: "__Secure-neon-auth.session_token",
  value: "signed-session-cookie-value",
};

function anonJwt(n: number): string {
  const payload = Buffer.from(
    JSON.stringify({ role: "anonymous", sub: `anon-${n}`, exp: 9999999999 }),
  ).toString("base64url");
  return `header.${payload}.signature`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

function cookieStore(cookies: { name: string; value: string }[]) {
  return {
    getAll: () => cookies,
    get: (name: string) => cookies.find((c) => c.name === name),
    has: () => cookies.length > 0,
    set: () => undefined,
    delete: () => undefined,
  };
}

type Wire = { url: string; signal: AbortSignal | null };

/** A fetch stub that never answers — only the request's abort signal ends it. */
function stubHangingAuth(): Wire[] {
  const wire: Wire[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      wire.push({ url: requestUrl(input), signal: init?.signal ?? null });
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () =>
          reject(new DOMException("The operation was aborted.", "AbortError"));
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort);
      });
    }),
  );
  return wire;
}

beforeEach(() => {
  process.env.NEON_AUTH_BASE_URL = AUTH_BASE;
  process.env.NEON_DATA_API_URL = DATA_BASE;
  cookiesMock.mockReset();
  resetAnonymousTokenCacheForTests();
  __resetMintCooldown();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.NEON_AUTH_BASE_URL;
  delete process.env.NEON_DATA_API_URL;
});

describe("mint budget (t_81b09ba8)", () => {
  it("aborts a hung auth backend at the shared deadline and skips the sibling mint", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    const wire = stubHangingAuth();

    const started = Date.now();
    const client = await getSupabaseServerClient();
    const elapsed = Date.now() - started;

    // Bounded: one budget for the whole request, not one per endpoint.
    expect(elapsed).toBeGreaterThanOrEqual(700);
    expect(elapsed).toBeLessThan(2_000);

    // The mint carried an abort signal…
    expect(wire).toHaveLength(1);
    expect(wire[0].url).toBe(`${AUTH_BASE}/token`);
    expect(wire[0].signal).not.toBeNull();

    // …the session budget was spent, so `/token/anonymous` was never asked…
    expect(wire.map((w) => w.url)).not.toContain(
      `${AUTH_BASE}/token/anonymous`,
    );

    // …and the caller got the classified degraded client, never a bare request.
    const { error } = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", "u1");
    expect(isDbTokenUnavailable(error)).toBe(true);
    expect(wire.some((w) => w.url.startsWith(DATA_BASE))).toBe(false);
  });

  it("bounds a hung /get-session too — identity resolution cannot outlive the render", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    const wire: Wire[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        wire.push({ url, signal: init?.signal ?? null });
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          const abort = () =>
            reject(new DOMException("The operation was aborted.", "AbortError"));
          if (signal?.aborted) abort();
          else signal?.addEventListener("abort", abort);
        });
      }),
    );

    const started = Date.now();
    const user = await getNeonSessionUser();
    const elapsed = Date.now() - started;

    // Guests/outage resolve to null instead of hanging, and the lookup carried
    // an abort signal (origin/main had none).
    expect(user).toBeNull();
    expect(elapsed).toBeLessThan(2_000);
    expect(wire).toHaveLength(1);
    expect(wire[0].url).toBe(`${AUTH_BASE}/get-session`);
    expect(wire[0].signal).not.toBeNull();
  });

  it("does not re-pay the budget against a mint path that just hung (negative cache)", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    const wire = stubHangingAuth();

    await getSupabaseServerClient();
    const afterFirst = wire.length;

    const t1 = Date.now();
    await getSupabaseServerClient();
    expect(Date.now() - t1).toBeLessThan(200);
    // `/token` is on the negative cache: the second render asks nothing.
    expect(wire.length).toBe(afterFirst);
  });

  it("never caches a 401/403 as an outage", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    const wire: Wire[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        wire.push({ url, signal: init?.signal ?? null });
        if (url === `${AUTH_BASE}/token`) {
          return Promise.resolve(jsonResponse({ error: "unauthenticated" }, 401));
        }
        if (url === `${AUTH_BASE}/token/anonymous`) {
          return Promise.resolve(jsonResponse({ token: anonJwt(1) }));
        }
        return Promise.resolve(jsonResponse([{ role: "anonymous" }]));
      }),
    );

    await getSupabaseServerClient();
    await getSupabaseServerClient();

    // A refusal is per-identity, so each render asks again.
    expect(
      wire.filter((w) => w.url === `${AUTH_BASE}/token`),
    ).toHaveLength(2);
  });

  it("clears the negative cache on a successful mint", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    let healthy = false;
    const tokenCalls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url === `${AUTH_BASE}/token`) {
          tokenCalls.push(url);
          if (!healthy) return Promise.resolve(jsonResponse({}, 503));
          const jwt = Buffer.from(
            JSON.stringify({ role: "authenticated", sub: "u1", exp: 9999999999 }),
          ).toString("base64url");
          return Promise.resolve(jsonResponse({ token: `h.${jwt}.s` }));
        }
        if (url === `${AUTH_BASE}/token/anonymous`) {
          return Promise.resolve(jsonResponse({ token: anonJwt(2) }));
        }
        return Promise.resolve(jsonResponse([{ role: "authenticated" }]));
      }),
    );

    // 503 → cooldown recorded…
    await getSupabaseServerClient();
    expect(tokenCalls).toHaveLength(1);
    await getSupabaseServerClient();
    expect(tokenCalls).toHaveLength(1); // still cached as unhealthy

    // …a later success clears it, and the next mint goes to the network again.
    healthy = true;
    // Simulate the cooldown window elapsing without sleeping 8 s.
    __resetMintCooldown();
    await getSupabaseServerClient();
    expect(tokenCalls).toHaveLength(2);
  });
});
