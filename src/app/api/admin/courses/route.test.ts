/**
 * admin/courses/route.test.ts — admin API gate (US-016). Non-admin callers get
 * 403 BEFORE any data access; admins get the course list. Mirrors the "route
 * gate" tests across the admin backend (every route shares requireAdminApi).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { GET } from "./route";

const ADMIN_ID = "user-admin";
const MEMBER_ID = "user-member";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAdmin.mockReset();
  mocks.getAccessUserId.mockReset();
  mocks.service.from.mockReset();
});

describe("GET /api/admin/courses", () => {
  it("403s a guest (no session) — gate fires before any data access", async () => {
    mocks.getAccessUserId.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mocks.service.from).not.toHaveBeenCalled();
  });

  it("403s a signed-in non-admin", async () => {
    mocks.getAccessUserId.mockResolvedValue(MEMBER_ID);
    mocks.isAdmin.mockResolvedValue(false);
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mocks.service.from).not.toHaveBeenCalled();
  });

  it("200s an admin and returns course rows + active entitlement counts", async () => {
    mocks.getAccessUserId.mockResolvedValue(ADMIN_ID);
    mocks.isAdmin.mockResolvedValue(true);

    const coursesRes = { data: [{ id: "c1", series_slug: "a", status: "live", access_model: "free", price_cents: null, created_at: "", updated_at: "" }], error: null };
    const entsRes = { data: [{ course_id: "c1" }, { course_id: "c1" }], error: null };

    const coursesQuery = { select: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue(coursesRes) };
    const entsQuery = { select: vi.fn().mockReturnThis(), is: vi.fn().mockResolvedValue(entsRes) };
    mocks.service.from.mockImplementation((table: string) =>
      table === "courses" ? coursesQuery : entsQuery,
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { activeEntitlementCount: number }[] };
    expect(json.ok).toBe(true);
    expect(json.data[0].activeEntitlementCount).toBe(2);
  });
});
