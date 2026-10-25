/**
 * src/lib/learn-public.test.ts — regression guard for t_a6b7630b (MEDIUM,
 * CWE-200): the learn data that crosses into the client graph must contain
 * PUBLICLY_LAUNCHED_SERIES only, and only the search-relevant fields.
 *
 * These tests run the REAL dataset, so a newly seeded stealth series cannot
 * silently appear in the site-search payload.
 */

import { describe, it, expect } from "vitest";
import {
  getPublicLearnSeries,
  getPublicLearnLessons,
  getPublicSearchData,
} from "./learn-public";
import { learnLessons, learnSeries } from "@/data/learn";
import { PUBLICLY_LAUNCHED_SERIES, isPubliclyLaunchedSeries } from "@/lib/atlas-launch";

const STEALTH_SLUGS = Array.from(
  new Set(
    learnSeries
      .map((s) => s.slug)
      .filter((slug) => !isPubliclyLaunchedSeries(slug)),
  ),
);

describe("learn-public — disclosure boundary (t_a6b7630b)", () => {
  it("sanity: the dataset really does contain stealth series", () => {
    expect(STEALTH_SLUGS.length).toBeGreaterThan(0);
    expect(STEALTH_SLUGS).toContain("ai-adoption");
    expect(STEALTH_SLUGS).toContain("sf-omni-consultant");
  });

  it("getPublicLearnSeries returns exactly the launched set", () => {
    const slugs = getPublicLearnSeries().map((s) => s.slug).sort();
    expect(slugs).toEqual([...PUBLICLY_LAUNCHED_SERIES].sort());
    for (const s of getPublicLearnSeries()) {
      expect(isPubliclyLaunchedSeries(s.slug)).toBe(true);
    }
  });

  it("getPublicLearnLessons drops every lesson of a stealth series", () => {
    const lessons = getPublicLearnLessons();
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.every((l) => isPubliclyLaunchedSeries(l.series))).toBe(true);
    expect(lessons.length).toBeLessThan(learnLessons.length);
    for (const slug of STEALTH_SLUGS) {
      expect(lessons.some((l) => l.series === slug)).toBe(false);
    }
  });

  it("the serialisable search payload names no stealth series and no stealth lesson", () => {
    const payload = getPublicSearchData();
    const json = JSON.stringify(payload);

    for (const slug of STEALTH_SLUGS) expect(json).not.toContain(slug);
    // Stealth series display names too, not just their slugs.
    for (const s of learnSeries) {
      if (isPubliclyLaunchedSeries(s.slug)) continue;
      expect(json).not.toContain(s.name);
    }
    // Lesson titles/excerpts of stealth series must not leak either.
    const stealthLessons = learnLessons.filter(
      (l) => !isPubliclyLaunchedSeries(l.series),
    );
    expect(stealthLessons.length).toBeGreaterThan(0);
    for (const l of stealthLessons.slice(0, 200)) {
      expect(json).not.toContain(l.title);
    }
  });

  it("the payload is projected to search-only fields (no lesson bodies / series chrome)", () => {
    const payload = getPublicSearchData();
    expect(payload.series.length).toBe(PUBLICLY_LAUNCHED_SERIES.length);
    for (const s of payload.series) {
      expect(Object.keys(s).sort()).toEqual(["description", "name", "slug"]);
    }
    for (const l of payload.lessons) {
      expect(Object.keys(l).sort()).toEqual([
        "excerpt",
        "series",
        "slug",
        "tags",
        "title",
      ]);
    }
  });
});
