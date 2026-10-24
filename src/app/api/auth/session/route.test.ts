/**
 * route.test.ts — GET /api/auth/session.
 *
 * Contract: guests and signed-in users both get a `user` object resolved from
 * the HttpOnly session cookie (`isAdmin` derived server-side, fail-closed on a
 * roles-read error), and every return path is per-user, so it must never be
 * stored by the browser or a shared intermediary (SEC-L2, CWE-525,
 * t_15a53bb8).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const getSessionUser = vi.fn();
  const isAdmin = vi.fn();
  const withAuthCookies = vi.fn();
  return { mocks: { getSessionUser, isAdmin, withAuthCookies } };
});

vi.mock("@/lib/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/lib/access", () => ({
  accessSeam: { isAdmin: mocks.isAdmin },
}));

// The jar wrapper only replays SDK cookie writes; run the handler in place.
vi.mock("@/lib/auth/cookie-jar", () => ({
  withAuthCookies: (fn: () => Promise<Response>) => mocks.withAuthCookies(fn),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withAuthCookies.mockImplementation((fn: () => Promise<Response>) => fn());
  mocks.getSessionUser.mockResolvedValue(null);
  mocks.isAdmin.mockResolvedValue(false);
});

describe("GET /api/auth/session", () => {
  it("returns the signed-in identity with the server-derived isAdmin flag", async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: "u1",
      email: "jane@adroit.io",
      name: null,
    });
    mocks.isAdmin.mockResolvedValue(true);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: "u1", email: "jane@adroit.io", isAdmin: true },
    });
    expect(mocks.isAdmin).toHaveBeenCalledWith("u1");
  });

  it("returns { user: null } when there is no session", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
    expect(mocks.isAdmin).not.toHaveBeenCalled();
  });

  it("fails CLOSED to isAdmin=false when the roles read throws", async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: "u1",
      email: "jane@adroit.io",
      name: null,
    });
    mocks.isAdmin.mockRejectedValue(new Error("seam down"));

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: "u1", email: "jane@adroit.io", isAdmin: false },
    });
  });

  it("degrades to { user: null } when the session read throws", async () => {
    mocks.getSessionUser.mockRejectedValue(new Error("auth unreachable"));

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });

  it("goes through the cookie jar so SDK cookie refreshes are replayed", async () => {
    await GET();
    expect(mocks.withAuthCookies).toHaveBeenCalledTimes(1);
  });
});

/**
 * SEC-L2 (t_15a53bb8) — identity payload: no browser or intermediary storage.
 */
describe("GET /api/auth/session — cache headers (SEC-L2 t_15a53bb8)", () => {
  it("marks the signed-in payload private and no-store", async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: "u1",
      email: "jane@adroit.io",
      name: null,
    });
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("marks the guest payload private and no-store", async () => {
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("marks the degraded payload private and no-store", async () => {
    mocks.getSessionUser.mockRejectedValue(new Error("auth unreachable"));
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
