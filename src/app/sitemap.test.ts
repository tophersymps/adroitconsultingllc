/**
 * src/app/sitemap.test.ts — the sitemap must not advertise URLs a guest cannot
 * resolve (SEO L1, t_018620c9).
 *
 * Background: the sitemap filtered `courses` on `status = 'live'` only. The
 * three stealth series (`access_model = 'granted'`) are therefore submitted to
 * crawlers even though the series page answers 404 for a logged-out visitor
 * (the seam's stealth rule hides the course's existence from anyone without a
 * matching grant). 606 deep atlas URLs inside an 830-URL sitemap.
 *
 * What these tests lock down:
 *
 * 1. A live `granted` row contributes NO urls (series, lessons, checks, exam);
 *    a live non-granted row still contributes series + lesson urls.
 * 2. `isGuestVisibleCourse` agrees with the seam's decision core for a guest
 *    (no entitlements) across every status × access_model pair — one rule, not
 *    two drifting copies.
 * 3. An unreachable courses table still degrades to the content-derived
 *    fallback instead of failing the build.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { rowsRef, throwRef } = vi.hoisted(() => ({
  rowsRef: { current: [] as unknown[] },
  throwRef: { current: false },
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseAnonymousClient: async () => {
    if (throwRef.current) throw new Error("data api unreachable");
    return {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: rowsRef.current, error: null }),
        }),
      }),
    };
  },
}));

import sitemap from "./sitemap";
import { learnLessons, learnSeries } from "@/data/learn";
import { isGuestVisibleCourse, decideCourseAccessFromInput } from "@/lib/access";
import type {
  AccessModel,
  CourseRow,
  CourseStatus,
} from "@/shared/contracts-course-catalog";
import { siteConfig } from "@/lib/seo";

const learnUrl = `${siteConfig.url}${siteConfig.learnPath}`;

/** A series that has content AND is guest-visible in the live fixture. */
const visibleSeries = learnSeries[0];
/** A different content series we mark stealth in the fixture. */
const stealthSeries = learnSeries[1];

function courseRow(
  series_slug: string,
  status: CourseStatus,
  access_model: AccessModel,
): CourseRow {
  return {
    id: `c-${series_slug}`,
    series_slug,
    title: series_slug,
    status,
    access_model,
    price_cents: null,
    launched_at: null,
    created_at: "",
    updated_at: "",
  };
}

let urls: Set<string>;

beforeEach(async () => {
  throwRef.current = false;
  rowsRef.current = [
    // Anonymous RLS exposes live rows only; keep a pending row in the fixture
    // to prove the sitemap filters defensively even if that ever changes.
    courseRow(visibleSeries.slug, "live", "free"),
    courseRow(stealthSeries.slug, "live", "granted"),
    courseRow("archived-thing", "archived", "free"),
  ];
  const entries = await sitemap();
  urls = new Set(entries.map((e) => e.url));
});

describe("sitemap — guest visibility", () => {
  it("emits the hub and every guest-visible live series", () => {
    expect(urls.has(learnUrl)).toBe(true);
    expect(urls.has(`${learnUrl}/${visibleSeries.slug}`)).toBe(true);
  });

  it("emits no URL at all for a stealth (live + granted) series", () => {
    const stealthLessons = learnLessons.filter(
      (l) => l.series === stealthSeries.slug,
    );
    // Fixture sanity: the series must actually have content, otherwise this
    // test would pass vacuously.
    expect(stealthLessons.length).toBeGreaterThan(0);

    const leaked = [...urls].filter((u) =>
      u.startsWith(`${learnUrl}/${stealthSeries.slug}`),
    );
    expect(leaked).toEqual([]);
  });

  it("still emits the lesson URLs of the guest-visible series", () => {
    const firstLesson = learnLessons.find((l) => l.series === visibleSeries.slug);
    expect(firstLesson).toBeDefined();
    expect(urls.has(`${learnUrl}/${visibleSeries.slug}/${firstLesson!.slug}`)).toBe(
      true,
    );
  });

  it("degrades to the content-derived fallback when the DB is unreachable", async () => {
    throwRef.current = true;
    const entries = await sitemap();
    const fallbackUrls = new Set(entries.map((e) => e.url));
    // No crash, and the content-derived set is back in play.
    expect(fallbackUrls.has(`${learnUrl}/${stealthSeries.slug}`)).toBe(true);
  });
});

describe("isGuestVisibleCourse — parity with the access seam", () => {
  const statuses: CourseStatus[] = ["pending", "live", "archived"];
  const models: AccessModel[] = [
    "free",
    "subscription",
    "one-time",
    "sub-or-one-time",
    "granted",
  ];

  it("matches the seam's decision for a guest across every status/model pair", () => {
    for (const status of statuses) {
      for (const model of models) {
        const course = courseRow("s", status, model);
        // A guest: not admin, no entitlements, no subscriptions.
        const decision = decideCourseAccessFromInput({
          course,
          isAdmin: false,
          entitlements: [],
          subscriptions: [],
          now: new Date().toISOString(),
        });
        const resolvable = decision.kind !== "not-launched";
        expect(isGuestVisibleCourse(course), `${status}/${model}`).toBe(
          resolvable,
        );
      }
    }
  });
});
