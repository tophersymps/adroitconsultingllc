/**
 * lifecycle.test.ts — tests for admin user lifecycle routes:
 *   - PATCH  /api/admin/users/[id]/status          (freeze / unfreeze)
 *   - POST   /api/admin/users/[id]/reset-password  (send password reset email)
 *   - POST   /api/admin/users/[id]/restore         (restore tombstoned user)
 *   - DELETE /api/admin/users/[id]                 (soft & hard delete + guards)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const getAccessUserId = vi.fn();
  const isAdmin = vi.fn();
  const getAuthUser = vi.fn();
  const setUserFrozenState = vi.fn();
  const revokeUserSessions = vi.fn();
  const softDeleteAuthUser = vi.fn();
  const hardDeleteAuthUser = vi.fn();
  const restoreTombstonedAuthUser = vi.fn();
  const requestPasswordReset = vi.fn();
  const service = { from: vi.fn() };
  return {
    mocks: {
      getAccessUserId,
      isAdmin,
      getAuthUser,
      setUserFrozenState,
      revokeUserSessions,
      softDeleteAuthUser,
      hardDeleteAuthUser,
      restoreTombstonedAuthUser,
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
  getAuthUser: mocks.getAuthUser,
  setUserFrozenState: mocks.setUserFrozenState,
  revokeUserSessions: mocks.revokeUserSessions,
  softDeleteAuthUser: mocks.softDeleteAuthUser,
  hardDeleteAuthUser: mocks.hardDeleteAuthUser,
  restoreTombstonedAuthUser: mocks.restoreTombstonedAuthUser,
}));

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: () => ({
    requestPasswordReset: mocks.requestPasswordReset,
  }),
}));

import { PATCH as patchStatus } from "./status/route";
import { POST as postResetPassword } from "./reset-password/route";
import { POST as postRestore } from "./restore/route";
import { DELETE as deleteUser } from "./route";

const ADMIN_ID = "3f2b8c1e-9d4a-4f7b-8c2d-1a6e5b9f0c3d";
const TARGET_ID = "7a1d0c3b-5e2f-4a8b-9c6d-0f1e2a3b4c5d";

function admin() {
  mocks.getAccessUserId.mockResolvedValue(ADMIN_ID);
  mocks.isAdmin.mockResolvedValue(true);
}

function wireAuditAndRole(role = "member", adminCount = 2) {
  const auditInserts: unknown[] = [];
  mocks.service.from.mockImplementation((table: string) => {
    if (table === "user_roles") {
      return {
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => ({
          eq: async () =>
            opts?.head
              ? { count: adminCount, error: null }
              : { data: [{ role }], error: null },
          maybeSingle: async () => ({ data: { role }, error: null }),
        }),
      };
    }
    if (table === "admin_audit_log") {
      return {
        insert: async (row: unknown) => {
          auditInserts.push(row);
          return { error: null };
        },
      };
    }
    return {};
  });
  return auditInserts;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthUser.mockResolvedValue({ id: TARGET_ID, email: "member@adroit.io" });
  mocks.requestPasswordReset.mockResolvedValue({ error: null });
});

describe("PATCH /api/admin/users/[id]/status", () => {
  it("prevents an admin from freezing their own account (409)", async () => {
    admin();
    const req = new NextRequest("http://localhost:3000/api/admin/users/self/status", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.1" },
      body: JSON.stringify({ action: "freeze" }),
    });
    const res = await patchStatus(req, { params: Promise.resolve({ id: ADMIN_ID }) });
    expect(res.status).toBe(409);
    expect(mocks.setUserFrozenState).not.toHaveBeenCalled();
  });

  it("freezes a user, revokes sessions, and logs user.freeze", async () => {
    admin();
    const audits = wireAuditAndRole("member");
    mocks.service.from.mockImplementation((table: string) => {
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { role: "member" }, error: null }),
            }),
          }),
        };
      }
      if (table === "admin_audit_log") {
        return {
          insert: async (row: unknown) => {
            audits.push(row);
            return { error: null };
          },
        };
      }
      return {};
    });
    mocks.setUserFrozenState.mockResolvedValue({
      frozenAt: "2026-11-02T00:00:00.000Z",
      frozenReason: "Security review",
      revokedSessions: 2,
    });

    const req = new NextRequest("http://localhost:3000/api/admin/users/u2/status", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.2" },
      body: JSON.stringify({ action: "freeze", reason: "Security review" }),
    });
    const res = await patchStatus(req, { params: Promise.resolve({ id: TARGET_ID }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({
      user_id: TARGET_ID,
      status: "frozen",
      revoked_sessions: 2,
    });
    expect(audits[0]).toMatchObject({
      action: "user.freeze",
      target_type: "user",
      target_id: TARGET_ID,
    });
  });
});

describe("POST /api/admin/users/[id]/reset-password", () => {
  it("triggers password reset email and logs user.password_reset", async () => {
    admin();
    const audits = wireAuditAndRole("member");
    const req = new NextRequest(
      "http://localhost:3000/api/admin/users/u2/reset-password",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.3" },
        body: JSON.stringify({ revoke_sessions: false }),
      },
    );
    const res = await postResetPassword(req, {
      params: Promise.resolve({ id: TARGET_ID }),
    });
    expect(res.status).toBe(200);
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "member@adroit.io",
        redirectTo: expect.stringContaining("/reset-password"),
      }),
    );
    expect(audits[0]).toMatchObject({
      action: "user.password_reset",
      target_id: TARGET_ID,
    });
  });
});

describe("DELETE /api/admin/users/[id] & POST /api/admin/users/[id]/restore", () => {
  it("soft-deletes a user by default and logs user.delete_soft", async () => {
    admin();
    const audits: unknown[] = [];
    mocks.service.from.mockImplementation((table: string) => {
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { role: "member" }, error: null }),
            }),
          }),
        };
      }
      if (table === "admin_audit_log") {
        return {
          insert: async (row: unknown) => {
            audits.push(row);
            return { error: null };
          },
        };
      }
      return {};
    });
    mocks.softDeleteAuthUser.mockResolvedValue({
      id: TARGET_ID,
      email: "member@adroit.io",
      deletedAt: "2026-11-02T00:00:00.000Z",
    });

    const req = new NextRequest("http://localhost:3000/api/admin/users/u2?mode=soft", {
      method: "DELETE",
      headers: { "x-forwarded-for": "10.0.0.4" },
    });
    const res = await deleteUser(req, { params: Promise.resolve({ id: TARGET_ID }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({
      user_id: TARGET_ID,
      mode: "soft",
      status: "tombstoned",
    });
    expect(audits[0]).toMatchObject({
      action: "user.delete_soft",
      target_id: TARGET_ID,
    });
  });

  it("restores a tombstoned user and logs user.restore", async () => {
    admin();
    const audits = wireAuditAndRole("member");
    mocks.restoreTombstonedAuthUser.mockResolvedValue({
      id: TARGET_ID,
      email: "member@adroit.io",
      name: "Member",
    });

    const req = new NextRequest("http://localhost:3000/api/admin/users/u2/restore", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.5" },
      body: JSON.stringify({ send_reset_email: true }),
    });
    const res = await postRestore(req, { params: Promise.resolve({ id: TARGET_ID }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({
      user_id: TARGET_ID,
      status: "active",
      reset_email_sent: true,
    });
    expect(audits[0]).toMatchObject({
      action: "user.restore",
      target_id: TARGET_ID,
    });
  });
});
