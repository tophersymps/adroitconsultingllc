/**
 * route.test.ts — PATCH /api/admin/users/[id]/role lockout guards (t_10214e52).
 *
 * An admin must not be able to demote themselves, and the last remaining
 * admin must not be demotable (no in-app recovery path — CWE-841,
 * operational).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const getAccessUserId = vi.fn();
  const isAdmin = vi.fn();
  const getAuthUser = vi.fn();
  const service = { from: vi.fn() };
  return { mocks: { getAccessUserId, isAdmin, getAuthUser, service } };
});

vi.mock("@/lib/access", () => ({
  accessSeam: { isAdmin: mocks.isAdmin },
  getAccessUserId: mocks.getAccessUserId,
}));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => mocks.service,
}));

vi.mock("@/lib/supabase/auth-admin", () => ({
  getAuthUser: mocks.getAuthUser,
}));

import { PATCH } from "./route";

const ADMIN_ID = "admin-1";

function req(role: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/users/u2/role", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "10.0.0.1",
    },
    body: JSON.stringify({ role }),
  });
}

function admin() {
  mocks.getAccessUserId.mockResolvedValue(ADMIN_ID);
  mocks.isAdmin.mockResolvedValue(true);
}

/**
 * service.from mock: only public tables now (the target-exists check moved to
 * getAuthUser). user_roles: select("role") → previous role (maybeSingle);
 * select("user_id") → admin-count rows.
 */
function wire({ previousRole, adminCountRows }: { previousRole: string; adminCountRows: unknown[] }) {
  const upserts: unknown[] = [];
  mocks.getAuthUser.mockResolvedValue({ id: "u2", email: "u2@example.com" });
  mocks.service.from.mockImplementation((table: string) => {
    if (table === "user_roles") {
      return {
        select: (cols: string) =>
          cols === "role"
            ? { eq: () => ({ maybeSingle: async () => ({ data: { role: previousRole }, error: null }) }) }
            : { eq: async () => ({ data: adminCountRows, error: null }) },
        upsert: async (row: unknown) => {
          upserts.push(row);
          return { error: null };
        },
      };
    }
    return {};
  });
  return upserts;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAdmin.mockReset();
  mocks.getAccessUserId.mockReset();
  mocks.getAuthUser.mockReset();
  mocks.service.from.mockReset();
});

describe("PATCH /api/admin/users/[id]/role — lockout guards (t_10214e52)", () => {
  it("rejects an admin demoting themselves (400)", async () => {
    admin();
    const upserts = wire({ previousRole: "admin", adminCountRows: [] });
    // target id == the acting admin (self-demotion)
    const res = await PATCH(req("member"), {
      params: Promise.resolve({ id: ADMIN_ID }),
    });
    expect(res.status).toBe(400);
    expect(upserts).toHaveLength(0);
  });

  it("rejects demoting the last remaining admin (400)", async () => {
    admin();
    // Only one admin row total → demoting the target would lock everyone out.
    const upserts = wire({ previousRole: "admin", adminCountRows: [{ user_id: ADMIN_ID }] });
    const res = await PATCH(req("member"), {
      params: Promise.resolve({ id: "admin-2" }),
    });
    expect(res.status).toBe(400);
    expect(upserts).toHaveLength(0);
  });

  it("allows demoting an admin when another admin remains (200)", async () => {
    admin();
    const upserts = wire({
      previousRole: "admin",
      adminCountRows: [{ user_id: ADMIN_ID }, { user_id: "admin-2" }],
    });
    const res = await PATCH(req("member"), {
      params: Promise.resolve({ id: "admin-2" }),
    });
    expect(res.status).toBe(200);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ user_id: "admin-2", role: "member" });
  });
});
