/**
 * route.test.ts — DELETE /api/admin/entitlements row-affected check (t_10214e52).
 *
 * A revoke that matches no active granted row must not claim success nor
 * write a misleading entitlement.revoke audit row (CWE-778).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const getAccessUserId = vi.fn();
  const isAdmin = vi.fn();
  const service = { from: vi.fn() };
  return { mocks: { getAccessUserId, isAdmin, service } };
});

vi.mock("@/lib/access", () => ({
  accessSeam: { isAdmin: mocks.isAdmin },
  getAccessUserId: mocks.getAccessUserId,
}));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => mocks.service,
}));

import { DELETE } from "./route";

const ADMIN_ID = "user-admin";

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/entitlements", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "10.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

function admin() {
  mocks.getAccessUserId.mockResolvedValue(ADMIN_ID);
  mocks.isAdmin.mockResolvedValue(true);
}

/** user_entitlements chain: update().eq().eq().eq().is().select() → rows. */
function revokeChain(rows: unknown) {
  return {
    update: () => ({
      eq: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              select: async () => ({ data: rows, error: null }),
            }),
          }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAdmin.mockReset();
  mocks.getAccessUserId.mockReset();
  mocks.service.from.mockReset();
});

describe("DELETE /api/admin/entitlements — row-affected check (t_10214e52)", () => {
  it("403s a non-admin before touching data", async () => {
    mocks.getAccessUserId.mockResolvedValue("member");
    mocks.isAdmin.mockResolvedValue(false);
    const res = await DELETE(req({ userId: "u2", courseId: "c1" }));
    expect(res.status).toBe(403);
    expect(mocks.service.from).not.toHaveBeenCalled();
  });

  it("returns 404 and writes NO audit row when no active row is revoked", async () => {
    admin();
    mocks.service.from.mockImplementation((table: string) =>
      table === "user_entitlements" ? revokeChain([]) : { insert: async () => ({ error: null }) },
    );
    const res = await DELETE(req({ userId: "u2", courseId: "c1" }));
    expect(res.status).toBe(404);
    expect(mocks.service.from).not.toHaveBeenCalledWith("admin_audit_log");
  });

  it("revokes and writes an entitlement.revoke audit row when a row matched", async () => {
    admin();
    const auditInserts: unknown[] = [];
    mocks.service.from.mockImplementation((table: string) =>
      table === "user_entitlements"
        ? revokeChain([{ user_id: "u2" }])
        : {
            insert: async (row: unknown) => {
              auditInserts.push(row);
              return { error: null };
            },
          },
    );
    const res = await DELETE(req({ userId: "u2", courseId: "c1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.revoked).toBe(true);
    expect(mocks.service.from).toHaveBeenCalledWith("admin_audit_log");
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0]).toMatchObject({ action: "entitlement.revoke" });
  });
});
