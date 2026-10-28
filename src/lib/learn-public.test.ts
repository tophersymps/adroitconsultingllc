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

    // Scope: identity-bearing fields only. SLUGS are checked wherever they can
    // appear as identifiers (series slug, lesson slug, the lesson's `series`
    // back-reference) plus naming fields. Display NAMES are checked in the
    // fields that name a thing: the series `name` and the lesson `title`.
    //
    // `excerpt` (authored prose) and `tags` (free-text vocabulary) are excluded
    // on purpose. `tags` are carried through verbatim, so a topical tag equal to
    // a stealth series' display name ("AI Adoption" on an agentic-ai lesson
    // about change management) failed the old whole-payload string scan while
    // disclosing nothing. Stealth content still cannot reach this payload
    // silently: only launched series are projected, and a stealth document would
    // carry its own slug and series in the fields checked below.
    const identity = [
      ...payload.series.flatMap((s) => [s.slug, s.name]),
      ...payload.lessons.flatMap((l) => [l.slug, l.series, l.title]),
    ].join("\n");
    // Naming fields only, for the display-name assertions below.
    const naming = [
      ...payload.series.map((s) => s.name),
      ...payload.lessons.map((l) => l.title),
    ].join("\n");
    // Guard against a vacuous pass.
    expect(identity.length).toBeGreaterThan(0);
    expect(payload.lessons.length).toBeGreaterThan(0);

    for (const slug of STEALTH_SLUGS) expect(identity).not.toContain(slug);
    // Stealth series display names too, not just their slugs.
    for (const s of learnSeries) {
      if (isPubliclyLaunchedSeries(s.slug)) continue;
      expect(naming).not.toContain(s.name);
    }
    // Lesson titles of stealth series must not leak either.
    const stealthLessons = learnLessons.filter(
      (l) => !isPubliclyLaunchedSeries(l.series),
    );
    expect(stealthLessons.length).toBeGreaterThan(0);
    for (const l of stealthLessons.slice(0, 200)) {
      expect(identity).not.toContain(l.title);
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
