/**
 * admin.test.ts — the admin authorization gates (US-016 + decision t_62b515f6 §11).
 *
 * These gates are the ONLY place the app refuses to trust the signed
 * `session_data` cookie: that cookie keeps a deleted/revoked account
 * resolvable for up to 300 s (SDK default), so every admin gate re-resolves
 * identity upstream (`query.disableCookieCache === "true"`) before asking the
 * access seam about the role.
 *
 * `@/lib/session` is NOT mocked here on purpose — the point is to prove the
 * real wiring end to end: cookies → `getSession()` call shape → gate verdict.
 * Only the SDK boundary (`@/lib/auth/server`), the request context
 * (`next/headers`) and the role seam (`@/lib/access`) are faked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const getSession = vi.fn();
  const getAuthServer = vi.fn(() => ({ getSession }));
  const isAdmin = vi.fn();
  /* Cookie-store stand-in for `next/headers`; `cookies` holds the names set. */
  const cookies = new Set<string>();
  const cookieStore = {
    has: (name: string) => cookies.has(name),
    get: (name: string) => (cookies.has(name) ? { name, value: "v" } : undefined),
  };
  const requestHeaders = new Headers({ "x-forwarded-proto": "https" });
  const service = { from: vi.fn() };
  return {
    mocks: {
      getSession,
      getAuthServer,
      isAdmin,
      cookies,
      cookieStore,
      requestHeaders,
      service,
    },
  };
});

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: mocks.getAuthServer,
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(mocks.cookieStore),
  headers: () => Promise.resolve(mocks.requestHeaders),
}));

vi.mock("@/lib/access", () => ({
  accessSeam: { isAdmin: mocks.isAdmin },
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: async () => mocks.service,
}));

import {
  isCurrentUserAdmin,
  requireAdminApi,
  requireAdminPage,
} from "./admin";
import { SESSION_COOKIE_NAME } from "./session";

const ADMIN_ID = "admin-1";

/** The signed session-data cache cookie the SDK writes next to the token. */
const SESSION_DATA_COOKIE_NAME = "neon-auth.session_data";

const SESSION = {
  data: {
    session: { id: "s1" },
    user: { id: ADMIN_ID, email: "admin@adroit.io", name: "Admin" },
  },
  error: null,
};

/** Sign the fake request in with BOTH cookies the SDK needs to serve a cache hit. */
function signInWithCachedSessionData(): void {
  mocks.cookies.add(SESSION_COOKIE_NAME);
  mocks.cookies.add(SESSION_DATA_COOKIE_NAME);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookies.clear();
  mocks.requestHeaders.set("x-forwarded-proto", "https");
  signInWithCachedSessionData();
});

describe("requireAdminApi", () => {
  it("resolves identity upstream, bypassing the session_data cookie cache", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.isAdmin.mockResolvedValue(true);

    await expect(requireAdminApi()).resolves.toEqual({
      ok: true,
      userId: ADMIN_ID,
    });
    /* The acceptance pin (t_62b515f6 §11): the SDK drops its cookie cache only
     * for this exact query flag. */
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(mocks.getSession).toHaveBeenCalledWith({
      query: { disableCookieCache: "true" },
    });
    expect(mocks.isAdmin).toHaveBeenCalledWith(ADMIN_ID);
  });

  it("403s a session_data cookie whose upstream session is gone (deleted admin)", async () => {
    /* QA deleted the account out of band: the signed cookie still decodes to
     * an admin, but upstream `get-session` returns nothing. Must be 403 now,
     * not 300 s from now. */
    mocks.getSession.mockResolvedValue({ data: null, error: null });
    mocks.isAdmin.mockResolvedValue(true);

    const result = await requireAdminApi();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    /* The role seam must never even be consulted for a dead session. */
    expect(mocks.isAdmin).not.toHaveBeenCalled();
  });

  it("403s a signed-in non-admin", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.isAdmin.mockResolvedValue(false);

    const result = await requireAdminApi();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("403s a guest without touching the auth SDK (fast path)", async () => {
    mocks.cookies.clear();
    mocks.getSession.mockResolvedValue(SESSION);

    const result = await requireAdminApi();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.getAuthServer).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.isAdmin).not.toHaveBeenCalled();
  });

  it("degrades to 403 when the auth backend throws (never a 500)", async () => {
    mocks.getSession.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await requireAdminApi();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});

describe("requireAdminPage", () => {
  it("returns the acting userId for an upstream-confirmed admin", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.isAdmin.mockResolvedValue(true);

    await expect(requireAdminPage()).resolves.toEqual({ userId: ADMIN_ID });
    expect(mocks.getSession).toHaveBeenCalledWith({
      query: { disableCookieCache: "true" },
    });
  });

  it("renders 404 (null) for a cached cookie with no upstream session", async () => {
    mocks.getSession.mockResolvedValue({ data: null, error: null });
    mocks.isAdmin.mockResolvedValue(true);

    await expect(requireAdminPage()).resolves.toBeNull();
    expect(mocks.isAdmin).not.toHaveBeenCalled();
  });

  it("renders 404 (null) for a guest without touching the auth SDK", async () => {
    mocks.cookies.clear();

    await expect(requireAdminPage()).resolves.toBeNull();
    expect(mocks.getAuthServer).not.toHaveBeenCalled();
  });
});

describe("isCurrentUserAdmin", () => {
  it("is true for an upstream-confirmed admin", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.isAdmin.mockResolvedValue(true);

    await expect(isCurrentUserAdmin()).resolves.toBe(true);
    expect(mocks.getSession).toHaveBeenCalledWith({
      query: { disableCookieCache: "true" },
    });
  });

  it("is false when the upstream session is gone", async () => {
    mocks.getSession.mockResolvedValue({ data: null, error: null });
    mocks.isAdmin.mockResolvedValue(true);

    await expect(isCurrentUserAdmin()).resolves.toBe(false);
  });

  it("is false for a guest without touching the auth SDK", async () => {
    mocks.cookies.clear();

    await expect(isCurrentUserAdmin()).resolves.toBe(false);
    expect(mocks.getAuthServer).not.toHaveBeenCalled();
  });
});
