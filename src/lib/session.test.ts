/**
 * session.test.ts — canonical user resolution (R2-1).
 *
 * The auth backend is mocked; what matters here is the CONTRACT the whole app
 * depends on: `{id,email,name}` for a session, `null` for a guest, and `null`
 * (never a throw) when the auth backend is broken.
 *
 * Perf P2 regression: when the session-token cookie is absent the function must
 * return `null` WITHOUT driving the SDK — otherwise every guest pageview costs
 * an upstream `get-session` round trip (~40 ms warm, measured in
 * perf-review-t_d3c401c9.md).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const getSession = vi.fn();
  const getAuthServer = vi.fn(() => ({ getSession }));
  /* Cookie-store stand-in for `next/headers`; `cookies` holds the names set. */
  const cookies = new Set<string>();
  const cookieStore = {
    has: (name: string) => cookies.has(name),
    get: (name: string) => (cookies.has(name) ? { name, value: "v" } : undefined),
  };
  /* Request headers stand-in for `next/headers`; transport decides which
   * cookie family is accepted from `x-forwarded-proto`. */
  const requestHeaders = new Headers({ "x-forwarded-proto": "https" });
  return {
    mocks: { getSession, getAuthServer, cookies, cookieStore, requestHeaders },
  };
});

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: mocks.getAuthServer,
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(mocks.cookieStore),
  headers: () => Promise.resolve(mocks.requestHeaders),
}));

import {
  getSessionUser,
  getSessionUserId,
  hasSessionCredential,
  readSessionUser,
  PLAIN_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "./session";

const SESSION = {
  data: {
    session: { id: "s1" },
    user: { id: "u1", email: "a@adroit.io", name: "A" },
  },
  error: null,
};

/** Sign the fake request in (or out) by setting the session cookie name. */
function setSessionCookie(present: boolean): void {
  /* Both accepted names are cleared, otherwise a test that signs in under the
   * plain-http name leaks into the guest cases that follow. */
  mocks.cookies.delete(SESSION_COOKIE_NAME);
  mocks.cookies.delete(PLAIN_SESSION_COOKIE_NAME);
  if (present) mocks.cookies.add(SESSION_COOKIE_NAME);
}

beforeEach(() => {
  vi.clearAllMocks();
  /* Also drop any queued `mockResolvedValueOnce` implementations: a guest case
   * that short-circuits never consumes its queue, and the leftover would be
   * served to the next test's strict read. */
  mocks.getSession.mockReset();
  /* Default: a signed-in https request. Guest tests opt out explicitly. */
  mocks.requestHeaders.set("x-forwarded-proto", "https");
  setSessionCookie(true);
});

describe("getSessionUser", () => {
  it("returns the minimal user shape for a live session", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    await expect(getSessionUser()).resolves.toEqual({
      id: "u1",
      email: "a@adroit.io",
      name: "A",
    });
    expect(mocks.getAuthServer).toHaveBeenCalledTimes(1);
  });

  it("returns null for a guest (no session)", async () => {
    mocks.getSession.mockResolvedValue({ data: null, error: null });
    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("returns null when the backend throws (reads degrade to guest)", async () => {
    mocks.getSession.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("coerces a missing name/email to safe values", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { id: "s1" }, user: { id: "u1" } },
      error: null,
    });
    await expect(getSessionUser()).resolves.toEqual({
      id: "u1",
      email: "",
      name: null,
    });
  });

  it("resolves a session stored under the plain-http cookie name", async () => {
    /* Plain-http deployments (LAN staging / http preview) cannot store a
     * `__Secure-` cookie, so the SDK writes `neon-auth.session_token` there
     * (t_ab6c1cb6 F2). The fast path must not treat that as a guest. */
    mocks.requestHeaders.set("x-forwarded-proto", "http");
    setSessionCookie(false);
    mocks.cookies.add(PLAIN_SESSION_COOKIE_NAME);
    mocks.getSession.mockResolvedValue(SESSION);

    await expect(getSessionUser()).resolves.toEqual({
      id: "u1",
      email: "a@adroit.io",
      name: "A",
    });
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
  });

  it("ignores a planted plain cookie on https (M2, CWE-384)", async () => {
    /* A sibling subdomain plants `neon-auth.session_token` under a
     * registrable-domain cookie scope. On https only the `__Secure-` name is
     * a session, so this must be a guest — and must not drive the SDK. */
    setSessionCookie(false);
    mocks.cookies.add(PLAIN_SESSION_COOKIE_NAME);
    mocks.getSession.mockResolvedValue(SESSION);

    await expect(getSessionUser()).resolves.toBeNull();
    expect(mocks.getAuthServer).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("ignores a `__Secure-` cookie on plain http", async () => {
    /* A browser on plain http drops such a cookie anyway; accepting it would
     * let a stale/planted header masquerade as a session. */
    mocks.requestHeaders.set("x-forwarded-proto", "http");
    setSessionCookie(true);
    mocks.getSession.mockResolvedValue(SESSION);

    await expect(getSessionUser()).resolves.toBeNull();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("short-circuits guests without touching the auth SDK (perf P2)", async () => {
    setSessionCookie(false);
    mocks.getSession.mockResolvedValue(SESSION);

    await expect(getSessionUser()).resolves.toBeNull();

    /* The whole point: no getAuthServer() → no getSession() → no upstream
     * Neon Auth `get-session` fetch on an anonymous pageview. */
    expect(mocks.getAuthServer).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});

describe("getSessionUserId", () => {
  it("returns the id for a session and null for a guest", async () => {
    mocks.getSession.mockResolvedValueOnce(SESSION);
    await expect(getSessionUserId()).resolves.toBe("u1");

    setSessionCookie(false);
    mocks.getSession.mockResolvedValueOnce({ data: null });
    await expect(getSessionUserId()).resolves.toBeNull();
  });
});

describe("hasSessionCredential", () => {
  it("is true for a transport-correct session cookie", async () => {
    setSessionCookie(true);
    await expect(hasSessionCredential()).resolves.toBe(true);
  });

  it("is true for the plain-http cookie name on plain http", async () => {
    mocks.requestHeaders.set("x-forwarded-proto", "http");
    setSessionCookie(false);
    mocks.cookies.add(PLAIN_SESSION_COOKIE_NAME);
    await expect(hasSessionCredential()).resolves.toBe(true);
  });

  it("is false when no session cookie is present", async () => {
    setSessionCookie(false);
    await expect(hasSessionCredential()).resolves.toBe(false);
  });

  it("is false for a planted plain cookie on https", async () => {
    setSessionCookie(false);
    mocks.cookies.add(PLAIN_SESSION_COOKIE_NAME);
    await expect(hasSessionCredential()).resolves.toBe(false);
  });

  it("never drives the auth SDK", async () => {
    setSessionCookie(true);
    await hasSessionCredential();
    expect(mocks.getAuthServer).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});

/**
 * readSessionUser — the STRICT reader added for t_8101e74f.
 *
 * `ok: true, user: null` is a definitive "signed out" answer. Anything the
 * backend could not answer — network, timeout, 429, 5xx — must come back as
 * `{ ok: false, failure }` so the route can answer 503 SESSION_UNAVAILABLE
 * instead of telling a signed-in user they are signed out.
 */
describe("readSessionUser", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  /** Every logged argument, flattened to JSON for leak assertions. */
  function logged(): string {
    return JSON.stringify(consoleSpy.mock.calls);
  }

  it("returns the user when the backend answers", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    await expect(readSessionUser()).resolves.toEqual({
      ok: true,
      user: { id: "u1", email: "a@adroit.io", name: "A" },
    });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("coerces a missing name/email on the strict path too", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { id: "s1" }, user: { id: "u1" } },
      error: null,
    });
    await expect(readSessionUser()).resolves.toEqual({
      ok: true,
      user: { id: "u1", email: "", name: null },
    });
  });

  it("treats a null session as a definitive signed-out answer", async () => {
    mocks.getSession.mockResolvedValue({ data: null, error: null });
    await expect(readSessionUser()).resolves.toEqual({ ok: true, user: null });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("treats an upstream 401/403 as signed out, not as an outage", async () => {
    for (const status of [401, 403]) {
      consoleSpy.mockClear();
      mocks.getSession.mockResolvedValue({
        data: null,
        error: { status, message: "session revoked" },
      });
      await expect(readSessionUser()).resolves.toEqual({ ok: true, user: null });
      expect(consoleSpy).not.toHaveBeenCalled();
    }
  });

  it("classifies an upstream 429 with its Retry-After hint", async () => {
    mocks.getSession.mockResolvedValue({
      data: null,
      error: {
        status: 429,
        message: "slow down",
        headers: new Headers({ "x-retry-after": "60" }),
      },
    });

    await expect(readSessionUser()).resolves.toEqual({
      ok: false,
      failure: { errorClass: "http", status: 429, retryAfterSeconds: 60 },
    });
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith({
      event: "session_read_failed",
      errorClass: "http",
      status: 429,
    });
  });

  it("classifies an upstream 5xx as an availability failure", async () => {
    mocks.getSession.mockResolvedValue({
      data: null,
      error: { status: 503, message: "auth backend down" },
    });

    await expect(readSessionUser()).resolves.toEqual({
      ok: false,
      failure: { errorClass: "http", status: 503 },
    });
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith({
      event: "session_read_failed",
      errorClass: "http",
      status: 503,
    });
  });

  it("classifies a network error as an availability failure", async () => {
    mocks.getSession.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:443"));

    await expect(readSessionUser()).resolves.toEqual({
      ok: false,
      failure: { errorClass: "network" },
    });
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith({
      event: "session_read_failed",
      errorClass: "network",
    });
  });

  it("clamps an absurd Retry-After to the contract range", async () => {
    mocks.getSession.mockResolvedValue({
      data: null,
      error: { status: 429, retryAfterSeconds: 100000 },
    });
    const result = await readSessionUser();
    expect(result).toEqual({
      ok: false,
      failure: { errorClass: "http", status: 429, retryAfterSeconds: 120 },
    });
  });

  it("logs exactly one structured line with no identity material", async () => {
    mocks.getSession.mockResolvedValue({
      data: null,
      error: {
        status: 429,
        message: "rate limited for a@adroit.io",
        headers: new Headers({ "x-retry-after": "30" }),
      },
    });

    await readSessionUser();

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const payload = logged();
    // The single log line is the structured event — no upstream text, host,
    // cookie, token or email may ride along.
    expect(payload).not.toContain("a@adroit.io");
    expect(payload).not.toContain("rate limited");
    expect(payload).not.toContain("token");
    expect(payload).not.toContain("cookie");
    expect(payload).not.toContain("127.0.0.1");
    const [first] = consoleSpy.mock.calls[0];
    expect(Object.keys(first as object).sort()).toEqual([
      "errorClass",
      "event",
      "status",
    ]);
  });

  it("logs nothing on a successful read", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    await readSessionUser();
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
