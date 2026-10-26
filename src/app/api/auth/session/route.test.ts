/**
 * route.test.ts — GET /api/auth/session.
 *
 * Contract: guests and signed-in users both get a `user` object resolved from
 * the HttpOnly session cookie (`isAdmin` derived server-side, fail-closed on a
 * roles-read error), and every return path is per-user, so it must never be
 * stored by the browser or a shared intermediary (SEC-L2, CWE-525,
 * t_15a53bb8).
 *
 * Availability contract (t_8101e74f): "signed out" and "couldn't check" are
 * different answers. A cookie-bearing request whose strict session read fails
 * must get `503 SESSION_UNAVAILABLE` — never `200 { user: null }`. Only a
 * credential-less guest short-circuits to the 200 guest payload without an
 * upstream call.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const hasSessionCredential = vi.fn();
  const readSessionUser = vi.fn();
  const isAdmin = vi.fn();
  const withAuthCookies = vi.fn();
  return {
    mocks: { hasSessionCredential, readSessionUser, isAdmin, withAuthCookies },
  };
});

vi.mock("@/lib/session", () => ({
  hasSessionCredential: mocks.hasSessionCredential,
  readSessionUser: mocks.readSessionUser,
}));

vi.mock("@/lib/access", () => ({
  accessSeam: { isAdmin: mocks.isAdmin },
}));

// The jar wrapper only replays SDK cookie writes; run the handler in place.
vi.mock("@/lib/auth/cookie-jar", () => ({
  withAuthCookies: (fn: () => Promise<Response>) => mocks.withAuthCookies(fn),
}));

import { GET } from "./route";

const USER = { id: "u1", email: "jane@adroit.io", name: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withAuthCookies.mockImplementation((fn: () => Promise<Response>) => fn());
  // Default: a credential-bearing request whose strict read succeeded as a
  // signed-in user. Individual cases override.
  mocks.hasSessionCredential.mockResolvedValue(true);
  mocks.readSessionUser.mockResolvedValue({ ok: true, user: USER });
  mocks.isAdmin.mockResolvedValue(false);
});

describe("GET /api/auth/session", () => {
  it("returns the signed-in identity with the server-derived isAdmin flag", async () => {
    mocks.isAdmin.mockResolvedValue(true);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: "u1", email: "jane@adroit.io", isAdmin: true },
    });
    expect(mocks.isAdmin).toHaveBeenCalledWith("u1");
  });

  it("returns { user: null } for a guest without any upstream call", async () => {
    mocks.hasSessionCredential.mockResolvedValue(false);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
    // Guest fast path: no strict read, no roles read.
    expect(mocks.readSessionUser).not.toHaveBeenCalled();
    expect(mocks.isAdmin).not.toHaveBeenCalled();
  });

  it("returns { user: null } when the backend answered 'no session' (expired/revoked)", async () => {
    mocks.readSessionUser.mockResolvedValue({ ok: true, user: null });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
    expect(mocks.isAdmin).not.toHaveBeenCalled();
  });

  it("fails CLOSED to isAdmin=false when the roles read throws", async () => {
    mocks.isAdmin.mockRejectedValue(new Error("seam down"));

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: "u1", email: "jane@adroit.io", isAdmin: false },
    });
  });

  it("answers 503 SESSION_UNAVAILABLE on an upstream 429 and echoes Retry-After", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.readSessionUser.mockResolvedValue({
      ok: false,
      failure: { errorClass: "http", status: 429, retryAfterSeconds: 60 },
    });

    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      error: "We can't check your session right now. Please try again in a moment.",
      code: "SESSION_UNAVAILABLE",
    });
    expect(res.headers.get("retry-after")).toBe("60");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    // The 503 body must not carry a `user` key at all.
    expect(body).not.toHaveProperty("user");
    // readSessionUser owns the single structured log; the route must not log.
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("answers 503 on an upstream 5xx without inventing a Retry-After", async () => {
    mocks.readSessionUser.mockResolvedValue({
      ok: false,
      failure: { errorClass: "http", status: 503 },
    });

    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "We can't check your session right now. Please try again in a moment.",
      code: "SESSION_UNAVAILABLE",
    });
    expect(res.headers.get("retry-after")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("answers 503 on a network failure", async () => {
    mocks.readSessionUser.mockResolvedValue({
      ok: false,
      failure: { errorClass: "network" },
    });

    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "SESSION_UNAVAILABLE" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("never collapses an unexpected strict-read throw into 200 { user: null }", async () => {
    mocks.readSessionUser.mockRejectedValue(new Error("auth unreachable"));

    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "SESSION_UNAVAILABLE" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
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
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("marks the guest payload private and no-store", async () => {
    mocks.hasSessionCredential.mockResolvedValue(false);
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("marks the unavailable payload private and no-store", async () => {
    mocks.readSessionUser.mockResolvedValue({
      ok: false,
      failure: { errorClass: "network" },
    });
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
