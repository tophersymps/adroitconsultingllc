/**
 * src/lib/access.test.ts — unit tests for the server access seam (t_2eab480f).
 *
 * Covers the pure decision core + the full seam path (via a fake loader):
 * all five access models, guest/member/admin, not-launched, and the
 * catalog visibility rules (AC-1, AC-2, AC-3).
 */
import { describe, it, expect, vi } from "vitest";
import {
  buildCatalogEntries,
  courseGrantsAccess,
  createAccessSeam,
  decideCourseAccessFromInput,
  effectiveAccessState,
  isGuestVisibleCourse,
  type PlatformDataLoader,
} from "@/lib/access";
import type {
  CourseRow,
  SubscriptionRow,
  UserEntitlementRow,
} from "@/shared/contracts-course-catalog";

const NOW = "2026-08-25T12:00:00.000Z";

function course(over: Partial<CourseRow> = {}): CourseRow {
  return {
    id: "c1",
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

function entitlement(over: Partial<UserEntitlementRow> = {}): UserEntitlementRow {
  return {
    id: "e1",
    user_id: "u1",
    course_id: "c1",
    source: "granted",
    grant_note: null,
    granted_by: null,
    granted_at: NOW,
    revoked_at: null,
    ...over,
  };
}

function sub(over: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: "s1",
    user_id: "u1",
    plan: "learn",
    status: "active",
    current_period_end: "2099-01-01T00:00:00.000Z",
    created_at: NOW,
    ...over,
  };
}

/* ------------------------------------------------------------------ */
/*  Pure decision core                                                */
/* ------------------------------------------------------------------ */

describe("decideCourseAccessFromInput", () => {
  it("no courses row → not-launched", () => {
    expect(
      decideCourseAccessFromInput({
        course: null,
        isAdmin: false,
        entitlements: [],
        subscriptions: [],
        now: NOW,
      }),
    ).toEqual({ kind: "not-launched" });
  });

  it("admin previews any course regardless of status → admin-preview", () => {
    for (const status of ["pending", "live", "archived"] as const) {
      expect(
        decideCourseAccessFromInput({
          course: course({ status }),
          isAdmin: true,
          entitlements: [],
          subscriptions: [],
          now: NOW,
        }),
      ).toEqual({ kind: "admin-preview" });
    }
  });

  it("non-live + non-admin → not-launched (even with an entitlement)", () => {
    expect(
      decideCourseAccessFromInput({
        course: course({ status: "pending", access_model: "granted" }),
        isAdmin: false,
        entitlements: [entitlement()],
        subscriptions: [],
        now: NOW,
      }),
    ).toEqual({ kind: "not-launched" });
  });

  it("free → granted to a guest (userId null) — preserves public lessons", () => {
    expect(
      decideCourseAccessFromInput({
        course: course({ access_model: "free" }),
        isAdmin: false,
        entitlements: [],
        subscriptions: [],
        now: NOW,
      }),
    ).toEqual({ kind: "granted" });
  });

  it("granted model → granted only with an active granted entitlement for THIS course (stealth: non-entitled → not-launched)", () => {
    const c = course({ access_model: "granted" });
    expect(
      decideCourseAccessFromInput({
        course: c,
        isAdmin: false,
        entitlements: [],
        subscriptions: [],
        now: NOW,
      }),
    ).toEqual({ kind: "not-launched" });
    expect(
      decideCourseAccessFromInput({
        course: c,
        isAdmin: false,
        entitlements: [entitlement({ source: "granted" })],
        subscriptions: [],
        now: NOW,
      }),
    ).toEqual({ kind: "granted" });
    // an entitlement for a DIFFERENT course must not unlock this one
    expect(
      decideCourseAccessFromInput({
        course: c,
        isAdmin: false,
        entitlements: [entitlement({ course_id: "other-course" })],
        subscriptions: [],
        now: NOW,
      }),
    ).toEqual({ kind: "not-launched" });
  });

  it("admin previews a granted course even without an entitlement → admin-preview", () => {
    expect(
      decideCourseAccessFromInput({
        course: course({ access_model: "granted" }),
        isAdmin: true,
        entitlements: [],
        subscriptions: [],
        now: NOW,
      }),
    ).toEqual({ kind: "admin-preview" });
  });

  it("one-time model → granted only with a one-time entitlement (granted does NOT unlock)", () => {
    const c = course({ access_model: "one-time" });
    expect(
      decideCourseAccessFromInput({
        course: c,
        isAdmin: false,
        entitlements: [entitlement({ source: "granted" })],
        subscriptions: [],
        now: NOW,
      }),
    ).toEqual({ kind: "paywall" });
    expect(
      decideCourseAccessFromInput({
        course: c,
        isAdmin: false,
        entitlements: [entitlement({ source: "one-time" })],
        subscriptions: [],
        now: NOW,
      }),
    ).toEqual({ kind: "granted" });
  });

  it("subscription model → granted with an active in-future subscription", () => {
    const c = course({ access_model: "subscription" });
    expect(
      decideCourseAccessFromInput({
        course: c,
        isAdmin: false,
        entitlements: [],
        subscriptions: [sub()],
        now: NOW,
      }),
    ).toEqual({ kind: "granted" });
    // canceled or expired sub → paywall
    expect(
      decideCourseAccessFromInput({
        course: c,
        isAdmin: false,
        entitlements: [],
        subscriptions: [sub({ status: "canceled" })],
        now: NOW,
      }),
    ).toEqual({ kind: "paywall" });
    expect(
      decideCourseAccessFromInput({
        course: c,
        isAdmin: false,
        entitlements: [],
        subscriptions: [sub({ current_period_end: "2020-01-01T00:00:00.000Z" })],
        now: NOW,
      }),
    ).toEqual({ kind: "paywall" });
  });

  it("sub-or-one-time → granted with a one-time entitlement OR an active sub", () => {
    const c = course({ access_model: "sub-or-one-time" });
    expect(
      decideCourseAccessFromInput({
        course: c,
        isAdmin: false,
        entitlements: [entitlement({ source: "one-time" })],
        subscriptions: [],
        now: NOW,
      }),
    ).toEqual({ kind: "granted" });
    expect(
      decideCourseAccessFromInput({
        course: c,
        isAdmin: false,
        entitlements: [],
        subscriptions: [sub()],
        now: NOW,
      }),
    ).toEqual({ kind: "granted" });
    expect(
      decideCourseAccessFromInput({
        course: c,
        isAdmin: false,
        entitlements: [],
        subscriptions: [],
        now: NOW,
      }),
    ).toEqual({ kind: "paywall" });
  });
});

describe("courseGrantsAccess", () => {
  it("revoked entitlements are filtered before this function (active only passed in)", () => {
    // The loader filters revoked_at IS NULL; here we just confirm granted model
    // depends purely on the entitlement array passed in.
    expect(courseGrantsAccess("granted", [], [], NOW, "c1")).toBe(false);
  });
});

describe("effectiveAccessState (ADR-220 five-state resolver)", () => {
  it("missing or non-live course → none", () => {
    expect(
      effectiveAccessState({ course: null, entitlements: [], subscriptions: [], now: NOW }),
    ).toBe("none");
    for (const status of ["pending", "archived"] as const) {
      expect(
        effectiveAccessState({
          course: course({ status }),
          entitlements: [entitlement()],
          subscriptions: [sub()],
          now: NOW,
        }),
      ).toBe("none");
    }
  });

  it("free model → free for everyone", () => {
    expect(
      effectiveAccessState({
        course: course({ access_model: "free" }),
        entitlements: [],
        subscriptions: [],
        now: NOW,
      }),
    ).toBe("free");
  });

  it("granted entitlement → granted", () => {
    expect(
      effectiveAccessState({
        course: course({ access_model: "granted" }),
        entitlements: [entitlement({ source: "granted" })],
        subscriptions: [],
        now: NOW,
      }),
    ).toBe("granted");
  });

  it("one-time entitlement → one-time", () => {
    expect(
      effectiveAccessState({
        course: course({ access_model: "one-time" }),
        entitlements: [entitlement({ source: "one-time" })],
        subscriptions: [],
        now: NOW,
      }),
    ).toBe("one-time");
  });

  it("subscription grants access → subscribed (subscription + sub-or-one-time models)", () => {
    for (const access_model of ["subscription", "sub-or-one-time"] as const) {
      expect(
        effectiveAccessState({
          course: course({ access_model }),
          entitlements: [],
          subscriptions: [sub()],
          now: NOW,
        }),
      ).toBe("subscribed");
    }
  });

  it("canceled / past_due / expired subscription → none (does not grant)", () => {
    const c = course({ access_model: "subscription" });
    for (const status of ["canceled", "past_due"] as const) {
      expect(
        effectiveAccessState({ course: c, entitlements: [], subscriptions: [sub({ status })], now: NOW }),
      ).toBe("none");
    }
    expect(
      effectiveAccessState({
        course: c,
        entitlements: [],
        subscriptions: [sub({ current_period_end: "2020-01-01T00:00:00.000Z" })],
        now: NOW,
      }),
    ).toBe("none");
  });

  it("precedence: granted beats a subscription for the same course", () => {
    const c = course({ access_model: "sub-or-one-time" });
    expect(
      effectiveAccessState({
        course: c,
        entitlements: [entitlement({ source: "granted" })],
        subscriptions: [sub()],
        now: NOW,
      }),
    ).toBe("granted");
    expect(
      effectiveAccessState({
        course: c,
        entitlements: [entitlement({ source: "one-time" })],
        subscriptions: [sub()],
        now: NOW,
      }),
    ).toBe("one-time");
  });

  it("no path → none (never 'empty = no access' ambiguity)", () => {
    expect(
      effectiveAccessState({
        course: course({ access_model: "subscription" }),
        entitlements: [],
        subscriptions: [],
        now: NOW,
      }),
    ).toBe("none");
  });

  it("entitlement for a DIFFERENT course is ignored", () => {
    expect(
      effectiveAccessState({
        course: course({ access_model: "granted" }),
        entitlements: [entitlement({ source: "granted", course_id: "other" })],
        subscriptions: [],
        now: NOW,
      }),
    ).toBe("none");
  });
});

/* ------------------------------------------------------------------ */
/*  Catalog visibility (AC-1)                                         */
/* ------------------------------------------------------------------ */

describe("buildCatalogEntries", () => {
  it("live visible to all; pending+free renders publicly as coming-soon; archived hidden (B-10/D1)", () => {
    const courses = [
      course({ id: "live", series_slug: "a", status: "live" }),
      course({ id: "pend", series_slug: "b", status: "pending" }),
      course({ id: "arch", series_slug: "c", status: "archived" }),
    ];
    const member = buildCatalogEntries({
      isAdmin: false,
      courses,
      entitlements: [],
      subscriptions: [],
      now: NOW,
    });
    expect(member.find((e) => e.course.id === "live")?.visible).toBe(true);
    // B-10/D1: pending + non-granted access model now shows the public
    // "coming soon" placeholder instead of being stealth-hidden.
    expect(member.find((e) => e.course.id === "pend")?.visible).toBe(true);
    expect(member.find((e) => e.course.id === "arch")?.visible).toBe(false);

    const admin = buildCatalogEntries({
      isAdmin: true,
      courses,
      entitlements: [],
      subscriptions: [],
      now: NOW,
    });
    expect(admin.every((e) => e.visible)).toBe(true);
  });

  it("stealth-granted: non-entitled member does NOT see a granted course; entitled member + admin do", () => {
    const granted = course({ id: "granted-course", access_model: "granted" });
    const memberNoEnt = buildCatalogEntries({
      isAdmin: false,
      courses: [granted],
      entitlements: [],
      subscriptions: [],
      now: NOW,
    });
    expect(memberNoEnt[0].visible).toBe(false);
    expect(memberNoEnt[0].canAccess).toBe(false);

    const memberWithEnt = buildCatalogEntries({
      isAdmin: false,
      courses: [granted],
      entitlements: [entitlement({ course_id: "granted-course" })],
      subscriptions: [],
      now: NOW,
    });
    expect(memberWithEnt[0].visible).toBe(true);
    expect(memberWithEnt[0].canAccess).toBe(true);

    const admin = buildCatalogEntries({
      isAdmin: true,
      courses: [granted],
      entitlements: [],
      subscriptions: [],
      now: NOW,
    });
    expect(admin[0].visible).toBe(true);
    expect(admin[0].canAccess).toBe(true);
  });

  it("granted course entitlement for a DIFFERENT course does not make it visible", () => {
    const entries = buildCatalogEntries({
      isAdmin: false,
      courses: [course({ id: "granted-course", access_model: "granted" })],
      entitlements: [entitlement({ course_id: "other-course" })],
      subscriptions: [],
      now: NOW,
    });
    expect(entries[0].visible).toBe(false);
    expect(entries[0].canAccess).toBe(false);
  });

  it("B-10/D1: pending + non-granted access model renders publicly as a coming-soon card (visible, not accessible)", () => {
    for (const model of [
      "free",
      "subscription",
      "sub-or-one-time",
      "one-time",
    ] as const) {
      const entries = buildCatalogEntries({
        isAdmin: false,
        courses: [course({ id: "pend", status: "pending", access_model: model })],
        entitlements: [],
        subscriptions: [],
        now: NOW,
      });
      expect(entries[0].visible).toBe(true);
      expect(entries[0].canAccess).toBe(false); // not live → not accessible
    }
  });

  it("B-10/D1: pending + granted stays stealth-hidden from a non-entitled member; visible to a grant-holder and admin", () => {
    const pendingGranted = course({ id: "pend-granted", status: "pending", access_model: "granted" });
    const memberNoEnt = buildCatalogEntries({
      isAdmin: false,
      courses: [pendingGranted],
      entitlements: [],
      subscriptions: [],
      now: NOW,
    });
    expect(memberNoEnt[0].visible).toBe(false);

    const memberWithEnt = buildCatalogEntries({
      isAdmin: false,
      courses: [pendingGranted],
      entitlements: [entitlement({ course_id: "pend-granted", source: "granted" })],
      subscriptions: [],
      now: NOW,
    });
    expect(memberWithEnt[0].visible).toBe(true);

    const admin = buildCatalogEntries({
      isAdmin: true,
      courses: [pendingGranted],
      entitlements: [],
      subscriptions: [],
      now: NOW,
    });
    expect(admin[0].visible).toBe(true);
  });

  it("B-10/D1: archived courses remain hidden from non-admins regardless of access model", () => {
    for (const model of ["granted", "free"] as const) {
      const entries = buildCatalogEntries({
        isAdmin: false,
        courses: [course({ id: "arch", status: "archived", access_model: model })],
        entitlements: [],
        subscriptions: [],
        now: NOW,
      });
      expect(entries[0].visible).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Full seam via fake loader                                         */
/* ------------------------------------------------------------------ */

function fakeLoader(over: Partial<PlatformDataLoader> = {}): PlatformDataLoader {
  return {
    getCourseBySlug: vi.fn().mockResolvedValue(null),
    getCatalogCourses: vi.fn().mockResolvedValue([]),
    getRole: vi.fn().mockResolvedValue(null),
    getActiveEntitlements: vi.fn().mockResolvedValue([]),
    getActiveSubscriptions: vi.fn().mockResolvedValue([]),
    getSections: vi.fn().mockResolvedValue([]),
    getGroups: vi.fn().mockResolvedValue([]),
    getPrerequisites: vi.fn().mockResolvedValue([]),
    ...over,
  };
}

describe("accessSeam (createAccessSeam over fake loader)", () => {
  it("isAdmin: false for guests and non-admin roles", async () => {
    const loader = fakeLoader({ getRole: vi.fn().mockResolvedValue(null) });
    const seam = createAccessSeam(loader);
    expect(await seam.isAdmin(null)).toBe(false);
    expect(await seam.isAdmin("u1")).toBe(false);
    expect(loader.getRole).toHaveBeenCalledWith("u1");
  });

  it("isAdmin: true for admin role rows", async () => {
    const loader = fakeLoader({ getRole: vi.fn().mockResolvedValue("admin") });
    const seam = createAccessSeam(loader);
    expect(await seam.isAdmin("u-admin")).toBe(true);
  });

  it("decideCourseAccess wires the loader to the pure core (stealth-granted → not-launched for gated member)", async () => {
    const loader = fakeLoader({
      getCourseBySlug: vi.fn().mockResolvedValue(
        course({ access_model: "granted" }),
      ),
      getRole: vi.fn().mockResolvedValue(null),
    });
    const seam = createAccessSeam(loader);
    expect(await seam.decideCourseAccess("u1", "test-series")).toEqual({
      kind: "not-launched",
    });
  });

  it("decideCourseAccess → granted for an entitled member", async () => {
    const loader = fakeLoader({
      getCourseBySlug: vi.fn().mockResolvedValue(
        course({ access_model: "granted" }),
      ),
      getRole: vi.fn().mockResolvedValue(null),
      getActiveEntitlements: vi.fn().mockResolvedValue([
        entitlement({ source: "granted" }),
      ]),
    });
    const seam = createAccessSeam(loader);
    expect(await seam.decideCourseAccess("u1", "test-series")).toEqual({
      kind: "granted",
    });
  });

  it("decideCourseAccess → admin-preview for an admin", async () => {
    const loader = fakeLoader({
      getCourseBySlug: vi.fn().mockResolvedValue(course({ status: "pending" })),
      getRole: vi.fn().mockResolvedValue("admin"),
    });
    const seam = createAccessSeam(loader);
    expect(await seam.decideCourseAccess("u-admin", "test-series")).toEqual({
      kind: "admin-preview",
    });
  });

  it("getCatalogForUser: guests get no entitlements lookup and live-only entries", async () => {
    const loader = fakeLoader({
      getCatalogCourses: vi.fn().mockResolvedValue([
        course({ id: "live", series_slug: "a", status: "live" }),
      ]),
      getRole: vi.fn().mockResolvedValue(null),
    });
    const seam = createAccessSeam(loader);
    const res = await seam.getCatalogForUser(null);
    expect(res.isAdmin).toBe(false);
    expect(res.entries).toHaveLength(1);
    expect(loader.getActiveEntitlements).not.toHaveBeenCalled();
    expect(res.entries[0].visible).toBe(true);
    expect(res.entries[0].canAccess).toBe(true); // free model
  });
});

/* ------------------------------------------------------------------ */
/*  PERF-LOW-2 (t_10a6b284): batched catalog read == per-series seam  */
/* ------------------------------------------------------------------ */

/**
 * `/api/continue-learning` now gates every series off ONE
 * `getCatalogForUser` call instead of one `decideCourseAccess` per series.
 * That substitution is only sound if, for the same loader, a series is
 * "accessible" under both paths. Pin the equivalence here (the route test
 * pins the read count and the response body).
 */
describe("PERF-LOW-2: getCatalogForUser.canAccess ⇔ decideCourseAccess granted|admin-preview", () => {
  const matrix: CourseRow[] = [
    course({ id: "free-live", series_slug: "free-live", access_model: "free" }),
    course({ id: "granted-live", series_slug: "granted-live", access_model: "granted" }),
    course({ id: "granted-live-held", series_slug: "granted-live-held", access_model: "granted" }),
    course({ id: "one-time", series_slug: "one-time", access_model: "one-time" }),
    course({ id: "one-time-held", series_slug: "one-time-held", access_model: "one-time" }),
    course({ id: "sub", series_slug: "sub", access_model: "subscription" }),
    course({
      id: "sub-one-time",
      series_slug: "sub-one-time",
      access_model: "sub-or-one-time",
    }),
    course({ id: "pending", series_slug: "pending", status: "pending", access_model: "free" }),
    course({ id: "archived", series_slug: "archived", status: "archived", access_model: "free" }),
    // "no-row" is deliberately absent from the loader.
  ];

  const heldEntitlements = [
    entitlement({ id: "e-granted", course_id: "granted-live-held", source: "granted" }),
    entitlement({ id: "e-one-time", course_id: "one-time-held", source: "one-time" }),
  ];
  const subs = [sub({})];

  function loaderFor(opts: {
    courses: CourseRow[];
    isAdmin: boolean;
    entitlements?: UserEntitlementRow[];
    subscriptions?: SubscriptionRow[];
  }): PlatformDataLoader {
    return fakeLoader({
      getCatalogCourses: vi.fn().mockResolvedValue(opts.courses),
      getCourseBySlug: vi.fn(async (slug: string) =>
        opts.courses.find((c) => c.series_slug === slug) ?? null,
      ),
      getRole: vi.fn().mockResolvedValue(opts.isAdmin ? "admin" : null),
      getActiveEntitlements: vi.fn().mockResolvedValue(opts.entitlements ?? []),
      getActiveSubscriptions: vi.fn().mockResolvedValue(opts.subscriptions ?? []),
    });
  }

  const slugs = [...matrix.map((c) => c.series_slug), "no-row"];

  const cases: Array<{ name: string; opts: Parameters<typeof loaderFor>[0] }> = [
    { name: "member, no grants, no sub", opts: { courses: matrix, isAdmin: false } },
    {
      name: "member with grants + subscription",
      opts: {
        courses: matrix,
        isAdmin: false,
        entitlements: heldEntitlements,
        subscriptions: subs,
      },
    },
    {
      name: "member whose catalogue read is live-only (RLS)",
      opts: {
        courses: matrix.filter((c) => c.status === "live"),
        isAdmin: false,
        entitlements: heldEntitlements,
        subscriptions: subs,
      },
    },
    {
      name: "admin",
      opts: { courses: matrix, isAdmin: true, entitlements: heldEntitlements, subscriptions: subs },
    },
  ];

  for (const c of cases) {
    it(`agrees per series — ${c.name}`, async () => {
      const seam = createAccessSeam(loaderFor(c.opts));
      const catalog = await seam.getCatalogForUser(c.opts.isAdmin ? "u-admin" : "u1");
      const viaCatalog = new Set(
        catalog.entries.filter((e) => e.canAccess).map((e) => e.course.series_slug),
      );

      const viaPerSeries = new Set<string>();
      for (const slug of slugs) {
        const decision = await seam.decideCourseAccess(
          c.opts.isAdmin ? "u-admin" : "u1",
          slug,
        );
        if (decision.kind === "granted" || decision.kind === "admin-preview") {
          viaPerSeries.add(slug);
        }
      }

      expect([...viaCatalog].sort()).toEqual([...viaPerSeries].sort());
    });
  }
});


/*  isGuestVisibleCourse — the guest projection (ADR-218)             */
/* ------------------------------------------------------------------ */

describe("isGuestVisibleCourse", () => {
  const MODELS = [
    "free",
    "granted",
    "one-time",
    "subscription",
    "sub-or-one-time",
  ] as const;
  const STATUSES = ["pending", "live", "archived"] as const;

  it("live + granted → false (stealth: a guest would 404)", () => {
    expect(
      isGuestVisibleCourse(course({ status: "live", access_model: "granted" })),
    ).toBe(false);
  });

  it("live + any non-granted model → true (free, subscription, one-time, sub-or-one-time)", () => {
    for (const model of [
      "free",
      "subscription",
      "one-time",
      "sub-or-one-time",
    ] as const) {
      expect(
        isGuestVisibleCourse(course({ status: "live", access_model: model })),
      ).toBe(true);
    }
  });

  it("pending → false, whatever the access model", () => {
    for (const model of MODELS) {
      expect(
        isGuestVisibleCourse(course({ status: "pending", access_model: model })),
      ).toBe(false);
    }
  });

  it("archived → false, whatever the access model", () => {
    for (const model of MODELS) {
      expect(
        isGuestVisibleCourse(course({ status: "archived", access_model: model })),
      ).toBe(false);
    }
  });

  it("is the guest projection of decideCourseAccessFromInput (parity over the whole matrix)", () => {
    for (const status of STATUSES) {
      for (const model of MODELS) {
        const row = course({ status, access_model: model });
        const decision = decideCourseAccessFromInput({
          course: row,
          isAdmin: false,
          entitlements: [],
          subscriptions: [],
          now: NOW,
        });
        // A guest can SEE the series unless the decision hides its existence.
        // `not-launched` == hidden (404); `granted` / `paywall` == rendered.
        const visible = decision.kind !== "not-launched";
        expect({
          status,
          model,
          visible,
        }).toEqual({
          status,
          model,
          visible: isGuestVisibleCourse(row),
        });
      }
    }
  });
});
