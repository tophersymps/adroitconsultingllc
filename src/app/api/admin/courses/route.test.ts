/**
 * admin/courses/route.test.ts — admin API gate (US-016). Non-admin callers get
 * 403 BEFORE any data access; admins get the course list. Mirrors the "route
 * gate" tests across the admin backend (every route shares requireAdminApi).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const getSessionUserUncached = vi.fn();
  const isAdmin = vi.fn();
  const service = { from: vi.fn() };
  return { mocks: { getSessionUserUncached, isAdmin, service } };
});

vi.mock("@/lib/access", () => ({
  accessSeam: { isAdmin: mocks.isAdmin },
}));

vi.mock("@/lib/session", () => ({
  getSessionUserUncached: mocks.getSessionUserUncached,
}));

// R2-2: the admin surface reads and writes through the Data API client, whose
// RLS `is_admin()` policies gate it — there is no service-role client any more.
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: async () => mocks.service,
}));

import { GET } from "./route";

const ADMIN_ID = "user-admin";
const MEMBER_ID = "user-member";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAdmin.mockReset();
  mocks.getSessionUserUncached.mockReset();
  mocks.service.from.mockReset();
});

describe("GET /api/admin/courses", () => {
  it("403s a guest (no session) — gate fires before any data access", async () => {
    mocks.getSessionUserUncached.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mocks.service.from).not.toHaveBeenCalled();
  });

  it("403s a signed-in non-admin", async () => {
    mocks.getSessionUserUncached.mockResolvedValue({ id: MEMBER_ID, email: "", name: null });
    mocks.isAdmin.mockResolvedValue(false);
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mocks.service.from).not.toHaveBeenCalled();
  });

  it("200s an admin and returns course rows + active entitlement counts", async () => {
    mocks.getSessionUserUncached.mockResolvedValue({ id: ADMIN_ID, email: "", name: null });
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
