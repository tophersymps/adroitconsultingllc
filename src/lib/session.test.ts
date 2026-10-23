/**
 * session.test.ts — canonical user resolution (R2-1).
 *
 * The auth backend is mocked; what matters here is the CONTRACT the whole app
 * depends on: `{id,email,name}` for a session, `null` for a guest, and `null`
 * (never a throw) when the auth backend is broken.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const getSession = vi.fn();
  return { mocks: { getSession } };
});

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: () => ({ getSession: mocks.getSession }),
}));

import { getSessionUser, getSessionUserId } from "./session";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSessionUser", () => {
  it("returns the minimal user shape for a live session", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { id: "s1" }, user: { id: "u1", email: "a@adroit.io", name: "A" } },
      error: null,
    });
    await expect(getSessionUser()).resolves.toEqual({
      id: "u1",
      email: "a@adroit.io",
      name: "A",
    });
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
});

describe("getSessionUserId", () => {
  it("returns the id for a session and null for a guest", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: { id: "s1" }, user: { id: "u1", email: "a@adroit.io" } },
    });
    await expect(getSessionUserId()).resolves.toBe("u1");

    mocks.getSession.mockResolvedValueOnce({ data: null });
    await expect(getSessionUserId()).resolves.toBeNull();
  });
});
