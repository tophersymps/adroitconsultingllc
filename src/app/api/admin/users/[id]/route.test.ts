/**
 * route.test.ts — GET /api/admin/users/[id] (t_32ce7d79).
 *
 * The user detail must surface the user's active subscription alongside
 * entitlements so the admin Access Matrix can show a distinct subscriber
 * indicator (S) even when the user has zero entitlement rows. Billing is
 * read-only display — no writes here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { GET } from "./route";

const ADMIN_ID = "admin-1";
const USER_ID = "u1";

function admin() {
  mocks.getAccessUserId.mockResolvedValue(ADMIN_ID);
  mocks.isAdmin.mockResolvedValue(true);
}

/**
 * service.from mock: user_roles → role (maybeSingle), user_profiles → display
 * name (maybeSingle), user_entitlements → active rows, subscriptions → rows.
 */
function wire(opts: {
  role?: string;
  displayName?: string | null;
  entitlements?: { course_id: string; source: string }[];
  subs?: { plan: string; status: string; current_period_end: string | null }[];
}) {
  const { role = "member", displayName = null, entitlements = [], subs = [] } = opts;
  mocks.getAuthUser.mockResolvedValue({ id: USER_ID, email: "user@adroit.io" });
  mocks.service.from.mockImplementation((table: string) => {
    if (table === "user_roles") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: role ? { role } : null, error: null }) }) }),
      };
    }
    if (table === "user_profiles") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: displayName ? { display_name: displayName } : null, error: null }) }) }),
      };
    }
    if (table === "user_entitlements") {
      return {
        select: () => ({ eq: () => ({ is: async () => ({ data: entitlements, error: null }) }) }),
      };
    }
    if (table === "subscriptions") {
      return {
        select: () => ({ eq: async () => ({ data: subs, error: null }) }),
      };
    }
    return {};
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAdmin.mockReset();
  mocks.getAccessUserId.mockReset();
  mocks.getAuthUser.mockReset();
  mocks.service.from.mockReset();
});

describe("GET /api/admin/users/[id] — subscription surfacing (t_32ce7d79)", () => {
  it("403s a non-admin", async () => {
    mocks.getAccessUserId.mockResolvedValue("member");
    mocks.isAdmin.mockResolvedValue(false);
    const res = await GET(new Request("http://localhost:3000/api/admin/users/u1"), {
      params: Promise.resolve({ id: USER_ID }),
    });
    expect(res.status).toBe(403);
    expect(mocks.getAuthUser).not.toHaveBeenCalled();
  });

  it("404s an unknown user", async () => {
    admin();
    wire({});
    mocks.getAuthUser.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost:3000/api/admin/users/u1"), {
      params: Promise.resolve({ id: USER_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("surfaces an active subscription even with zero entitlements", async () => {
    admin();
    wire({
      subs: [{ plan: "learn", status: "active", current_period_end: "2999-01-01T00:00:00.000Z" }],
    });
    const res = await GET(new Request("http://localhost:3000/api/admin/users/u1"), {
      params: Promise.resolve({ id: USER_ID }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({
      user_id: USER_ID,
      entitlements: {},
      subscription: { plan: "learn", status: "active" },
    });
  });

  it("still surfaces G/P entitlements and null subscription when none active", async () => {
    admin();
    wire({
      entitlements: [
        { course_id: "c1", source: "granted" },
        { course_id: "c2", source: "one-time" },
      ],
      subs: [{ plan: "learn", status: "canceled", current_period_end: null }],
    });
    const res = await GET(new Request("http://localhost:3000/api/admin/users/u1"), {
      params: Promise.resolve({ id: USER_ID }),
    });
    const json = await res.json();
    expect(json.data.entitlements).toEqual({
      c1: "granted",
      c2: "one-time",
    });
    expect(json.data.subscription).toBeNull();
  });
});
