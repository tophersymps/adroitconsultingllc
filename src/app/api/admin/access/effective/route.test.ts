/**
 * route.test.ts — GET /api/admin/access/effective (ADR-223).
 *
 * The consolidated five-state accessor read: admin-gated (403 non-admin),
 * returns courses + users + resolved matrix + subscriber pulse, and reuses the
 * PR #170 subscription field (no duplicate field drift). Matrix resolves via
 * effectiveAccessState (imported from the seam — not re-implemented here).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const getAccessUserId = vi.fn();
  const isAdmin = vi.fn();
  const listAuthUsers = vi.fn();
  const service = { from: vi.fn() };
  return { mocks: { getAccessUserId, isAdmin, listAuthUsers, service } };
});

vi.mock("@/lib/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/access")>();
  return {
    ...actual,
    accessSeam: { isAdmin: mocks.isAdmin },
    getAccessUserId: mocks.getAccessUserId,
  };
});

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => mocks.service,
}));

vi.mock("@/lib/supabase/auth-admin", () => ({
  listAuthUsers: mocks.listAuthUsers,
}));

import { GET } from "./route";

const ADMIN_ID = "admin-1";

function admin() {
  mocks.getAccessUserId.mockResolvedValue(ADMIN_ID);
  mocks.isAdmin.mockResolvedValue(true);
}

/**
 * Wire public-table reads. Courses carry full rows (status/access_model/id).
 * subscriptions carry status + period; entitlements carry course_id/source.
 */
function wire(
  courses: { id: string; series_slug: string; status: string; access_model: string; price_cents: number | null }[],
  users: { id: string; email: string }[],
  opts: {
    roles?: { user_id: string; role: string }[];
    profiles?: { user_id: string; display_name: string | null }[];
    ents?: { user_id: string; course_id: string; source: string; id?: string; revoked_at?: string | null }[];
    subs?: { user_id: string; plan: string; status: string; current_period_end: string | null }[];
  } = {},
) {
  const { roles = [], profiles = [], ents = [], subs = [] } = opts;
  // A minimal chainable supabase builder: supports .select().order().is() and
  // resolves to { data, error }. Real routes chain these; the mock must too.
  const resultFor = (table: string): { data: unknown; error: null } => {
    const fullCourse = (c: (typeof courses)[number]) => ({
      id: c.id,
      series_slug: c.series_slug,
      title: c.series_slug,
      status: c.status,
      access_model: c.access_model,
      price_cents: c.price_cents ?? null,
      launched_at: null,
      created_at: "",
      updated_at: "",
    });
    const fullEnt = (e: (typeof ents)[number]) => ({
      id: e.id ?? e.course_id,
      user_id: e.user_id,
      course_id: e.course_id,
      source: e.source,
      grant_note: null,
      granted_by: null,
      granted_at: "",
      revoked_at: e.revoked_at ?? null,
    });
    switch (table) {
      case "courses":
        return { data: courses.map(fullCourse), error: null };
      case "user_roles":
        return { data: roles, error: null };
      case "user_profiles":
        return { data: profiles, error: null };
      case "user_entitlements":
        return { data: ents.map(fullEnt), error: null };
      case "subscriptions":
        return { data: subs, error: null };
      default:
        return { data: [], error: null };
    }
  };
  const chain = (table: string) => {
    const promise = Promise.resolve(resultFor(table));
    const builder = {
      select: () => builder,
      order: () => builder,
      is: () => builder,
      eq: () => builder,
      then: promise.then.bind(promise),
    };
    return builder;
  };
  mocks.service.from.mockImplementation((table: string) => chain(table));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAdmin.mockReset();
  mocks.getAccessUserId.mockReset();
  mocks.listAuthUsers.mockReset();
  mocks.service.from.mockReset();
});

describe("GET /api/admin/access/effective — consolidated accessor (ADR-223)", () => {
  it("403s a non-admin", async () => {
    mocks.getAccessUserId.mockResolvedValue("member");
    mocks.isAdmin.mockResolvedValue(false);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns courses, users, resolved five-state matrix + subscriber pulse", async () => {
    admin();
    mocks.listAuthUsers.mockResolvedValue([
      { id: "u1", email: "a@adroit.io" },
      { id: "u2", email: "b@adroit.io" },
    ]);
    wire(
      [
        { id: "c-granted", series_slug: "granted-track", status: "live", access_model: "granted", price_cents: null },
        { id: "c-free", series_slug: "free-course", status: "live", access_model: "free", price_cents: null },
        { id: "c-sub", series_slug: "sub-course", status: "live", access_model: "subscription", price_cents: 9900 },
        { id: "c-pending", series_slug: "pending", status: "pending", access_model: "subscription", price_cents: null },
      ],
      [
        { id: "u1", email: "a@adroit.io" },
        { id: "u2", email: "b@adroit.io" },
      ],
      {
        ents: [
          { user_id: "u1", course_id: "c-granted", source: "granted" },
          { user_id: "u1", course_id: "c-free", source: "one-time" },
        ],
        subs: [{ user_id: "u2", plan: "learn", status: "active", current_period_end: "2999-01-01T00:00:00.000Z" }],
      },
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    const data = json.data;

    // Courses: all rows present, pending included (grid dims it via status).
    expect(data.courses).toHaveLength(4);

    // Users: each has entitlements map + subscription field (PR #170 reuse).
    expect(data.users).toHaveLength(2);
    const u1 = data.users.find((u: { user_id: string }) => u.user_id === "u1");
    expect(u1.entitlements).toEqual({ "c-granted": "granted", "c-free": "one-time" });
    expect(u1.subscription).toBeNull();
    const u2 = data.users.find((u: { user_id: string }) => u.user_id === "u2");
    expect(u2.subscription).toMatchObject({ plan: "learn", status: "active" });

    // Matrix: u1 granted on granted-model; free on free; none on sub; u2 subscribed.
    expect(data.matrix.u1["c-granted"]).toBe("granted");
    expect(data.matrix.u1["c-free"]).toBe("free");
    expect(data.matrix.u1["c-sub"]).toBe("none");
    expect(data.matrix.u1["c-pending"]).toBe("none"); // non-live → none
    expect(data.matrix.u2["c-sub"]).toBe("subscribed");

    // Subscriber pulse counts by status.
    expect(data.subscriberPulse).toEqual({ active: 1, trialing: 0, canceled: 0, past_due: 0 });
  });

  it("reconciles with the users route shape (no duplicate subscription field drift)", async () => {
    admin();
    mocks.listAuthUsers.mockResolvedValue([{ id: "u1", email: "a@adroit.io" }]);
    wire(
      [{ id: "c1", series_slug: "s", status: "live", access_model: "free", price_cents: null }],
      [{ id: "u1", email: "a@adroit.io" }],
    );
    const res = await GET();
    const json = await res.json();
    // .subscription is a nullable object on each user (never a duplicate key or
    // an array) — same contract the /api/admin/users route emits.
    const row = json.data.users[0];
    expect("subscription" in row).toBe(true);
    expect(row.subscription).toBeNull();
  });

  it("returns 500 on a read failure (never a wrong empty matrix)", async () => {
    admin();
    const failChain = (data: unknown, error: unknown) => {
      const promise = Promise.resolve({ data, error });
      const builder = {
        select: () => builder,
        order: () => builder,
        is: () => builder,
        eq: () => builder,
        then: promise.then.bind(promise),
      };
      return builder;
    };
    mocks.service.from.mockImplementation((table: string) =>
      table === "courses"
        ? failChain(null, new Error("boom"))
        : failChain([], null),
    );
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
