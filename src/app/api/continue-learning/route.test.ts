/**
 * route.test.ts — GET /api/continue-learning (Round 3, t_e0362113).
 *
 * In-progress predicate: series with >=1 distinct completed lesson AND
 * < totalLessons, most-recent-first, resume link = lowest-numbered
 * uncompleted lesson. Guests always get [].
 *
 * PERF-LOW-2 (t_10a6b284): the access gate used to be one
 * `accessSeam.decideCourseAccess` per series (~36 serial DB reads on a
 * signed-in hub view). These tests pin the replacement contract:
 *   - a signed-in view issues a CONSTANT number of DB reads (5) no matter how
 *     many series exist, with exactly one `courses` read (never a per-series
 *     `series_slug` lookup), and
 *   - a guest view issues ZERO reads (no client is even constructed), and
 *   - the response body is unchanged: the accessible set the new batched read
 *     derives is compared against the old per-series `decideCourseAccess`
 *     loop for the same fixture.
 *
 * The seam is NOT mocked here — the real `accessSeam` runs over the mocked
 * data client so the read count is the production one.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { getAllSeries, getLessonsForSeries } from "@/lib/learn";
import { decideCourseAccessFromInput } from "@/lib/access";
import type {
  CourseRow,
  SubscriptionRow,
  UserEntitlementRow,
} from "@/shared/contracts-course-catalog";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getSessionUser: vi.fn(),
    getSupabaseServerClient: vi.fn(),
  },
}));

vi.mock("@/lib/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}));

import { GET } from "./route";

const NOW = new Date().toISOString();

/** A courses row; `series_slug` is the only field the route's join cares about. */
function course(over: Partial<CourseRow>): CourseRow {
  return {
    id: "c0",
    series_slug: "test-series",
    title: "Test Series",
    status: "live",
    access_model: "free",
    price_cents: null,
    launched_at: NOW,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

function entitledCourse(id: string, seriesSlug: string): CourseRow {
  return course({ id, series_slug: seriesSlug, access_model: "granted" });
}

/** Fixture: one row per interesting access state, keyed by series slug. */
function fixtureCourses(): CourseRow[] {
  return [
    course({ id: "s-agentic", series_slug: "agentic-ai", access_model: "free" }),
    course({ id: "s-omni", series_slug: "omni-studio-cert", access_model: "subscription" }),
    course({ id: "s-sfd", series_slug: "salesforce-data-architect", access_model: "one-time" }),
    entitledCourse("s-arch", "salesforce-architect"),
    // not live → not-launched for members
    course({ id: "s-hermes", series_slug: "hermes-consultant", status: "pending", access_model: "free" }),
    // live stealth-granted, no entitlement → not-launched (hidden)
    entitledCourse("s-atwork", "ai-at-work"),
    // no courses row at all → not-launched
  ];
}

/**
 * A PostgREST-shaped fake that records ONE read per `.from(table)` — i.e. the
 * number of DB round trips a route makes.
 */
function makeClient(tables: Record<string, unknown[]>) {
  const reads: string[] = [];
  const client = {
    from(table: string) {
      reads.push(table);
      const rows = tables[table] ?? [];
      const result = Promise.resolve({ data: rows, error: null as Error | null });
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          result.then(res, rej),
      };
      return chain;
    },
  };
  return { client, reads };
}

type Tables = Record<string, unknown[]>;

function install(opts: {
  user: { id: string; email: string } | null;
  tables: Tables;
}) {
  mocks.getSessionUser.mockResolvedValue(opts.user);
  const { client, reads } = makeClient(opts.tables);
  mocks.getSupabaseServerClient.mockResolvedValue(client);
  return { reads };
}

const ENTITLEMENTS: UserEntitlementRow[] = [
  {
    id: "e-arch",
    user_id: "u1",
    course_id: "s-arch",
    source: "granted",
    grant_note: null,
    granted_by: null,
    granted_at: NOW,
    revoked_at: null,
  },
  {
    id: "e-sfd",
    user_id: "u1",
    course_id: "s-sfd",
    source: "one-time",
    grant_note: null,
    granted_by: null,
    granted_at: NOW,
    revoked_at: null,
  },
];

const SUBSCRIPTIONS: SubscriptionRow[] = [
  {
    id: "sub1",
    user_id: "u1",
    plan: "learn",
    status: "active",
    current_period_end: "2099-01-01T00:00:00.000Z",
    created_at: NOW,
  },
];

function baseTables(over: Tables = {}): Tables {
  return {
    courses: fixtureCourses(),
    user_roles: [], // member
    user_entitlements: ENTITLEMENTS,
    subscriptions: SUBSCRIPTIONS,
    lesson_completion: [],
    ...over,
  };
}

const AUTHED = { id: "u1", email: "jane@adroit.io" };

/**
 * The PRE-FIX accessible set: one `decideCourseAccess` per series over the same
 * fixture rows. Used as the differential oracle for the batched rewrite.
 */
function legacyAccessibleSet(opts: {
  userId: string | null;
  tables: Tables;
}): Set<string> {
  const courses = (opts.tables.courses ?? []) as CourseRow[];
  const entitlements = (opts.tables.user_entitlements ?? []) as UserEntitlementRow[];
  const subscriptions = (opts.tables.subscriptions ?? []) as SubscriptionRow[];
  const roleRow = ((opts.tables.user_roles ?? []) as { role: string }[])[0];
  const isAdmin = !!opts.userId && roleRow?.role === "admin";
  const out = new Set<string>();
  for (const s of getAllSeries()) {
    const decision = decideCourseAccessFromInput({
      course: courses.find((c) => c.series_slug === s.slug) ?? null,
      isAdmin,
      entitlements: opts.userId ? entitlements : [],
      subscriptions: opts.userId ? subscriptions : [],
      now: NOW,
    });
    if (decision.kind === "granted" || decision.kind === "admin-preview") {
      out.add(s.slug);
    }
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUser.mockResolvedValue(null);
});

describe("GET /api/continue-learning", () => {
  it("returns [] for guests and performs ZERO DB reads", async () => {
    const { reads } = install({ user: null, tables: baseTables() });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });

    // PERF-LOW-2: no session cookie → no client, no query, no auth round trip.
    expect(mocks.getSupabaseServerClient).not.toHaveBeenCalled();
    expect(reads).toEqual([]);
  });

  it("returns an in-progress series with the next uncompleted lesson", async () => {
    const omniLessons = getLessonsForSeries("omni-studio-cert");
    const totalLessons = omniLessons.length;
    const completed = omniLessons
      .slice(0, 3)
      .map((l) => ({ lesson_slug: l.slug, completed_at: "2026-08-11T10:00:00Z" }));
    install({
      user: AUTHED,
      tables: baseTables({ lesson_completion: completed }),
    });

    const res = await GET();
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    const item = json.items[0];
    expect(item.seriesSlug).toBe("omni-studio-cert");
    expect(item.completedCount).toBe(3);
    expect(item.totalLessons).toBe(totalLessons);
    expect(item.percent).toBe(Math.round((3 / totalLessons) * 100));
    expect(item.nextLessonSlug).toBe(omniLessons[3].slug);
    expect(item.lastCompletedAt).toBe("2026-08-11T10:00:00Z");
  });

  it("excludes fully-completed series (completedCount === total)", async () => {
    const slugs = getLessonsForSeries("agentic-ai").map((l) => l.slug);
    const completed = slugs.map((slug) => ({
      lesson_slug: slug,
      completed_at: "2026-08-10T08:00:00Z",
    }));
    install({
      user: AUTHED,
      tables: baseTables({ lesson_completion: completed }),
    });

    const json = await (await GET()).json();
    // agentic-ai fully complete → not in-progress; nothing else has completions.
    expect(json.items).toEqual([]);
  });

  it("sorts multiple in-progress series most-recent-first", async () => {
    const agentic = getLessonsForSeries("agentic-ai")[0].slug;
    const omni = getLessonsForSeries("omni-studio-cert")[0].slug;
    install({
      user: AUTHED,
      tables: baseTables({
        lesson_completion: [
          { lesson_slug: agentic, completed_at: "2026-08-11T09:00:00Z" },
          { lesson_slug: omni, completed_at: "2026-08-09T09:00:00Z" },
        ],
      }),
    });

    const json = await (await GET()).json();
    expect(json.items.map((i: { seriesSlug: string }) => i.seriesSlug)).toEqual([
      "agentic-ai",
      "omni-studio-cert",
    ]);
  });

  it("excludes in-progress series the user cannot access (paywall / not-launched / stealth / no row)", async () => {
    // One completion in EVERY series: only accessible ones may surface.
    const tables = baseTables({
      lesson_completion: getAllSeries().flatMap((s) => {
        const first = getLessonsForSeries(s.slug)[0];
        return first
          ? [{ lesson_slug: first.slug, completed_at: "2026-08-11T10:00:00Z" }]
          : [];
      }),
      user_entitlements: [], // no grants → stealth/one-time courses lock
      subscriptions: [], // no sub → subscription course locks
    });
    install({ user: AUTHED, tables });

    const json = await (await GET()).json();
    const surfaced = json.items.map((i: { seriesSlug: string }) => i.seriesSlug).sort();
    // Only the free live series is readable for this member.
    expect(surfaced).toEqual(["agentic-ai"]);
  });

  it("PERF-LOW-2: signed-in view issues exactly 5 DB reads, one per table, independent of series count", async () => {
    const series = getAllSeries();
    expect(series.length).toBeGreaterThanOrEqual(12);
    const tables = baseTables({
      lesson_completion: series.flatMap((s, i) => {
        const first = getLessonsForSeries(s.slug)[0];
        return first
          ? [{ lesson_slug: first.slug, completed_at: `2026-08-0${(i % 9) + 1}T10:00:00Z` }]
          : [];
      }),
    });
    const { reads } = install({ user: AUTHED, tables });

    await GET();

    // courses + user_roles + user_entitlements + subscriptions (the seam) and
    // one lesson_completion read. 12 series → still 5.
    expect(reads.filter((t) => t === "courses")).toHaveLength(1);
    expect(reads.sort()).toEqual([
      "courses",
      "lesson_completion",
      "subscriptions",
      "user_entitlements",
      "user_roles",
    ]);
    // No per-series course lookup survives the rewrite.
    expect(reads.length).toBe(5);
  });

  it("PERF-LOW-2: accessible set is identical to the pre-fix per-series access loop", async () => {
    const series = getAllSeries();
    const tables = baseTables({
      lesson_completion: series.flatMap((s) => {
        const first = getLessonsForSeries(s.slug)[0];
        return first ? [{ lesson_slug: first.slug, completed_at: "2026-08-11T10:00:00Z" }] : [];
      }),
    });

    for (const user of [AUTHED, { id: "u-admin", email: "admin@adroit.io" }]) {
      const adminTables: Tables =
        user.id === "u-admin"
          ? { ...tables, user_roles: [{ role: "admin" }] }
          : tables;
      install({ user, tables: adminTables });

      const json = await (await GET()).json();
      const batched = new Set<string>(
        json.items.map((i: { seriesSlug: string }) => i.seriesSlug),
      );
      const legacy = legacyAccessibleSet({ userId: user.id, tables: adminTables });

      // Every series has a completion, so "accessible" ⇔ "surfaced".
      expect([...batched].sort()).toEqual([...legacy].sort());
    }
  });
});
