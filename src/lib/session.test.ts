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
  return { mocks: { getSession, getAuthServer, cookies, cookieStore } };
});

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: mocks.getAuthServer,
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(mocks.cookieStore),
}));

import {
  getSessionUser,
  getSessionUserId,
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
  /* Default: a signed-in request. Guest tests opt out explicitly. */
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
