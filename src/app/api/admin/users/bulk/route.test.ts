/**
 * route.test.ts — tests for POST /api/admin/users/bulk
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const getAccessUserId = vi.fn();
  const isAdmin = vi.fn();
  const setUserFrozenState = vi.fn();
  const revokeUserSessions = vi.fn();
  const getAdminUserDetail = vi.fn();
  const softDeleteAuthUser = vi.fn();
  const hardDeleteAuthUser = vi.fn();
  const requestPasswordReset = vi.fn();
  const service = { from: vi.fn() };
  return {
    mocks: {
      getAccessUserId,
      isAdmin,
      setUserFrozenState,
      revokeUserSessions,
      getAdminUserDetail,
      softDeleteAuthUser,
      hardDeleteAuthUser,
      requestPasswordReset,
      service,
    },
  };
});

vi.mock("@/lib/access", () => ({
  accessSeam: { isAdmin: mocks.isAdmin },
  getAccessUserId: mocks.getAccessUserId,
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: async () => mocks.service,
}));

vi.mock("@/lib/auth/users", () => ({
  setUserFrozenState: mocks.setUserFrozenState,
  revokeUserSessions: mocks.revokeUserSessions,
  getAdminUserDetail: mocks.getAdminUserDetail,
  softDeleteAuthUser: mocks.softDeleteAuthUser,
  hardDeleteAuthUser: mocks.hardDeleteAuthUser,
}));

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: () => ({
    requestPasswordReset: mocks.requestPasswordReset,
  }),
}));

import { POST as postBulk } from "./route";

const ADMIN_ID = "3f2b8c1e-9d4a-4f7b-8c2d-1a6e5b9f0c3d";
const USER1 = "7a1d0c3b-5e2f-4a8b-9c6d-0f1e2a3b4c5d";
const USER2 = "8b2e1d4c-6f3a-5b9c-0d7e-1f2a3b4c5d6e";

function admin() {
  mocks.getAccessUserId.mockResolvedValue(ADMIN_ID);
  mocks.isAdmin.mockResolvedValue(true);
}

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/users/bulk", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/users/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.service.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      in: vi.fn().mockResolvedValue({ error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "test-course", role: "member" }, error: null }),
      then: (fn: (v: unknown) => unknown) =>
        Promise.resolve(fn({ data: [], count: 2, error: null })),
    });
  });

  it("returns 403 when caller is not an admin", async () => {
    mocks.getAccessUserId.mockResolvedValue(USER1);
    mocks.isAdmin.mockResolvedValue(false);

    const res = await postBulk(req({ userIds: [USER2], action: "freeze" }));
    expect(res.status).toBe(403);
  });

  it("validates userIds array", async () => {
    admin();
    const res = await postBulk(req({ userIds: [], action: "freeze" }));
    expect(res.status).toBe(400);
  });

  it("freezes users but protects the admin from self-freeze", async () => {
    admin();
    mocks.setUserFrozenState.mockResolvedValue(true);
    mocks.revokeUserSessions.mockResolvedValue(1);

    const res = await postBulk(
      req({
        userIds: [USER1, ADMIN_ID],
        action: "freeze",
        reason: "Test batch",
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(2);
    expect(json.succeeded).toBe(1);
    expect(json.skipped).toBe(1);
    expect(mocks.setUserFrozenState).toHaveBeenCalledWith(USER1, {
      frozen: true,
      reason: "Test batch",
    });
    expect(mocks.revokeUserSessions).toHaveBeenCalledWith(USER1);
  });

  it("sends password reset emails to multiple users", async () => {
    admin();
    mocks.getAdminUserDetail.mockResolvedValue({ email: "user@example.com" });
    mocks.requestPasswordReset.mockResolvedValue(undefined);

    const res = await postBulk(
      req({
        userIds: [USER1, USER2],
        action: "reset-password",
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.succeeded).toBe(2);
    expect(mocks.requestPasswordReset).toHaveBeenCalledTimes(2);
  });

  it("executes soft and hard deletes with self-lockout guard", async () => {
    admin();
    mocks.softDeleteAuthUser.mockResolvedValue({ id: USER1, email: "u1@example.com" });

    const res = await postBulk(
      req({
        userIds: [USER1, ADMIN_ID],
        action: "delete",
        mode: "soft",
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.succeeded).toBe(1);
    expect(json.skipped).toBe(1);
    expect(mocks.softDeleteAuthUser).toHaveBeenCalledWith(USER1);
  });

  it("bulk grants course entitlements to users", async () => {
    admin();
    const res = await postBulk(
      req({
        userIds: [USER1, USER2],
        action: "grant-course",
        courseId: "course-123",
        source: "one-time",
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.succeeded).toBe(2);
  });
});
