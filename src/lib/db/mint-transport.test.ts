/**
 * src/lib/db/mint-transport.test.ts — the auth mint must not participate in
 * Next's static-render fetch tracking (t_72f9d850).
 *
 * WHY THIS EXISTS
 * ---------------
 * `next build` replaces `globalThis.fetch` with its instrumented fetch. For a
 * `cache: "no-store"` request issued while a route is being prerendered that
 * fetch reports a dynamic access and the legacy prerender store bails out by
 * THROWING `DynamicServerError`:
 *
 *   "Route /field-notes/<slug> couldn't be rendered statically because it used
 *    revalidate: 0 fetch"
 *
 * The mint's generic `catch {}` read that as a NETWORK failure: it armed the
 * process-wide mint cooldown (10-60 s) and every later DB read in that build
 * process degraded to the static launch mirror. `/atlas` (force-static + ISR)
 * therefore baked the "graceful empty hub" — the live Learn hub that rendered
 * 0 courses. Reproduced in a local `next build` before the fix:
 *
 *   [db] token unavailable { tokenPath: '/token/anonymous', status: null,
 *                            errorClass: 'network', ... }
 *   [learn-visibility] courses read failed — degrading learn visibility to the
 *                      static launched-series mirror
 *                      Error [DbTokenUnavailableError]: Neon Data API token is
 *                      unavailable
 *
 * These tests pin BOTH halves of the fix:
 *
 *   1. TRANSPORT — the mint and the `/get-session` lookup are issued through
 *      `mintFetch`, which carries Next's own `next.internal` opt-out (and keeps
 *      `cache: "no-store"` + the shared budget's `AbortSignal`) so the bail-out
 *      is never raised for them; the page's DATA reads are unaffected.
 *   2. CLASSIFICATION — if the signal is raised anyway it is rethrown, is not
 *      counted as a mint failure and does NOT arm the cooldown/breaker, so the
 *      next render mints again. A genuine network failure still degrades
 *      (fail-closed contract unchanged).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import {
  __resetMintCooldown,
  getNeonSessionUser,
  getSupabaseAnonymousClient,
  getSupabaseServerClient,
} from "./server";
import {
  anonTokenStats,
  resetAnonymousTokenCacheForTests,
} from "./anonymous-token";
import { isNextDynamicUsageError } from "./mint-transport";
import { isDbTokenUnavailable } from "./degraded-client";

const AUTH_BASE = "https://auth.test/neondb/auth";
const DATA_BASE = "https://data.test/neondb/rest/v1";

const SESSION_COOKIE = {
  name: "__Secure-neon-auth.session_token",
  value: "signed-session-cookie-value",
};

/**
 * Next's static-render bail-out signal, as thrown by the instrumented fetch
 * (`digest` is the only thing that identifies it — the message varies).
 */
class DynamicServerError extends Error {
  digest = "DYNAMIC_SERVER_USAGE";
  constructor(message: string) {
    super(message);
    this.name = "DynamicServerError";
  }
}

const dynamicUsage = () =>
  new DynamicServerError(
    "Route /field-notes/omni-studio-cert couldn't be rendered statically because it used revalidate: 0 fetch",
  );

/** A JWT-shaped anonymous token (the mint PROVES the `role` claim). */
function anonJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "EdDSA" })}.${b64({ role: "anonymous", exp: now + 3600 })}.signature`;
}

type Call = { url: string; init?: RequestInit };

let calls: Call[];

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Stub global fetch, recording every call so the wire request is assertable. */
function stubFetch(
  reply: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  calls = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    calls.push({ url, init });
    return reply(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A `next/headers` cookie store holding the given cookies. */
function cookieStore(cookies: { name: string; value: string }[]) {
  return {
    getAll: () => cookies,
    get: (name: string) => cookies.find((c) => c.name === name),
    has: (name: string) => cookies.some((c) => c.name === name),
    set: () => undefined,
    delete: () => undefined,
  };
}

/** RequestInit payload for a call, narrowed for the `next` config assertions. */
function initOf(url: string): (RequestInit & { next?: { internal?: boolean } }) | undefined {
  return calls.find((c) => c.url === url)?.init as
    | (RequestInit & { next?: { internal?: boolean } })
    | undefined;
}

function mintCalls(): Call[] {
  return calls.filter((c) => c.url === `${AUTH_BASE}/token/anonymous`);
}

beforeEach(() => {
  process.env.NEON_AUTH_BASE_URL = AUTH_BASE;
  process.env.NEON_DATA_API_URL = DATA_BASE;
  calls = [];
  cookiesMock.mockReset();
  resetAnonymousTokenCacheForTests();
  __resetMintCooldown();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEON_AUTH_BASE_URL;
  delete process.env.NEON_DATA_API_URL;
});

describe("t_72f9d850 transport: the mint stays out of Next's fetch tracking", () => {
  it("sends next.internal on the anonymous mint, keeping no-store + the budget signal", async () => {
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubFetch((url) => {
      if (url === `${AUTH_BASE}/token/anonymous`) return jsonResponse({ token: anonJwt() });
      if (url.startsWith(DATA_BASE)) return jsonResponse([{ id: "course-1" }]);
      return jsonResponse({ error: `unexpected ${url}` }, 500);
    });

    const client = await getSupabaseAnonymousClient();
    await client.from("courses").select("*");

    const mint = initOf(`${AUTH_BASE}/token/anonymous`);
    expect(mint?.next).toEqual({ internal: true });
    // `no-store` semantics and the bounded budget are unchanged by the opt-out.
    expect(mint?.cache).toBe("no-store");
    expect(mint?.signal).toBeDefined();

    // ...and the PAGE's data read is NOT opted out of Next's tracking: only the
    // auth handshake is.
    const dataCall = calls.find((c) => c.url.startsWith(DATA_BASE));
    expect(dataCall).toBeDefined();
    expect(
      (dataCall?.init as { next?: { internal?: boolean } } | undefined)?.next
        ?.internal,
    ).toBeUndefined();
  });

  it("sends next.internal on the session mint and on the /get-session lookup", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    const sessionJwt = `${Buffer.from("{}").toString("base64url")}.${Buffer.from(
      JSON.stringify({ role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url")}.signature`;
    stubFetch((url) => {
      if (url === `${AUTH_BASE}/token`) return jsonResponse({ token: sessionJwt });
      if (url === `${AUTH_BASE}/get-session`)
        return jsonResponse({ user: { id: "user-1", email: "a@b.test" } });
      if (url.startsWith(DATA_BASE)) return jsonResponse([]);
      return jsonResponse({ error: `unexpected ${url}` }, 500);
    });

    await getNeonSessionUser();
    expect(initOf(`${AUTH_BASE}/get-session`)?.next).toEqual({ internal: true });

    // The session mint of a credential-bearing request goes through the same
    // transport (a `no-store` fetch from /atlas/[series] would otherwise bail
    // the route out of static generation).
    resetAnonymousTokenCacheForTests();
    __resetMintCooldown();
    await getSupabaseServerClient();
    expect(initOf(`${AUTH_BASE}/token`)?.next).toEqual({ internal: true });
  });
});

describe("t_72f9d850 classification: a Next bail-out is not a mint failure", () => {
  it("recognises the DynamicServerError digest", () => {
    const err = dynamicUsage();
    expect(isNextDynamicUsageError(err)).toBe(true);
    // Never an over-broad catch: ordinary failures are not the signal.
    expect(isNextDynamicUsageError(new TypeError("fetch failed"))).toBe(false);
    expect(isNextDynamicUsageError(new Error("boom"))).toBe(false);
    expect(isNextDynamicUsageError(null)).toBe(false);
    expect(isNextDynamicUsageError({ digest: "NEXT_NOT_FOUND" })).toBe(false);
    // PostgREST failures are plain objects, not Errors: they must not match.
    expect(isNextDynamicUsageError({ code: "TOKEN_UNAVAILABLE" })).toBe(false);
  });

  it("rethrows the anonymous mint's bail-out instead of degrading the render", async () => {
    const err = dynamicUsage();
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubFetch((url) => {
      if (url === `${AUTH_BASE}/token/anonymous`) throw err;
      return jsonResponse({ error: `unexpected ${url}` }, 500);
    });

    // The render must SEE the signal (Next then renders the route dynamically);
    // it must not be turned into a degraded/empty read.
    await expect(getSupabaseAnonymousClient()).rejects.toBe(err);
    expect(isNextDynamicUsageError(err)).toBe(true);
  });

  it("rethrows the session mint's bail-out rather than guest-degrading", async () => {
    const err = dynamicUsage();
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubFetch((url) => {
      if (url === `${AUTH_BASE}/token`) throw err;
      return jsonResponse({ error: `unexpected ${url}` }, 500);
    });

    await expect(getSupabaseServerClient()).rejects.toBe(err);
    // Never a fall-through to the guest role either (fail-closed contract §9).
    expect(calls.some((c) => c.url === `${AUTH_BASE}/token/anonymous`)).toBe(false);
  });

  it("rethrows the /get-session lookup's bail-out instead of reporting a guest", async () => {
    const err = dynamicUsage();
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubFetch((url) => {
      if (url === `${AUTH_BASE}/get-session`) throw err;
      return jsonResponse({ error: `unexpected ${url}` }, 401);
    });

    await expect(getNeonSessionUser()).rejects.toBe(err);
  });

  it("does not count the signal as a mint failure nor arm the cooldown", async () => {
    const err = dynamicUsage();
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubFetch((url) => {
      if (url === `${AUTH_BASE}/token/anonymous`) throw err;
      return jsonResponse({ error: `unexpected ${url}` }, 500);
    });

    await expect(getSupabaseAnonymousClient()).rejects.toBe(err);
    await expect(getSupabaseAnonymousClient()).rejects.toBe(err);

    // Not a mint failure: no suppression, no failure accounting, and the second
    // render minted again. The pre-fix bug was exactly this: the first signal
    // silenced every later read in the process (that is what emptied /atlas).
    expect(anonTokenStats.failures).toBe(0);
    expect(anonTokenStats.throttled).toBe(0);
    expect(mintCalls()).toHaveLength(2);
  });

  it("still degrades a genuine network failure (fail-closed contract unchanged)", async () => {
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubFetch((url) => {
      if (url === `${AUTH_BASE}/token/anonymous`) throw new TypeError("fetch failed");
      if (url.startsWith(DATA_BASE)) return jsonResponse([{ id: "leak" }]);
      return jsonResponse({ error: `unexpected ${url}` }, 500);
    });

    const client = await getSupabaseAnonymousClient();
    const { data, error } = (await client.from("courses").select("*")) as {
      data: unknown;
      error: unknown;
    };

    expect(data).toBeNull();
    expect(isDbTokenUnavailable(error)).toBe(true);
    // Nothing is read without a credential.
    expect(calls.filter((c) => c.url.startsWith(DATA_BASE))).toHaveLength(0);
    // ...and a real failure is still accounted for and suppressed.
    expect(anonTokenStats.failures).toBe(1);
  });
});
