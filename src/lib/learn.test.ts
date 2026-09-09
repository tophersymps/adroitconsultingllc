import { describe, expect, it } from "vitest";
import { getSeriesProgress, toIsoDate } from "@/lib/learn";
import type { LearningSeries } from "@/data/types";

describe("toIsoDate (SEO ISO-8601 structured data t_fa2f15c7)", () => {
  it("converts a human-readable 'Month DD, YYYY' lesson date to ISO-8601", () => {
    expect(toIsoDate("August 04, 2026")).toBe("2026-08-04");
  });

  it("passes through 'Date unknown' unchanged", () => {
    expect(toIsoDate("Date unknown")).toBe("Date unknown");
  });

  it("passes through an empty string unchanged", () => {
    expect(toIsoDate("")).toBe("");
  });

  it("passes through any other unparseable string unchanged (no invalid dates)", () => {
    expect(toIsoDate("not a date")).toBe("not a date");
  });

  it("is a valid parseable ISO-8601 full-date for JSON-LD datePublished", () => {
    const iso = toIsoDate("August 04, 2026");
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false);
    // ISO-8601 must not carry the authored human "Month" form.
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("getSeriesProgress (Phase 1 curriculum vs published)", () => {
  const series: LearningSeries = {
    slug: "agentic-ai",
    name: "Agentic AI Path",
    description: "",
    gradient: "",
    lessons: [],
    totalLessons: 33, // highest published lesson number
    curriculumLessons: 90, // final planned count
  };

  it("reports published as the lesson count present", () => {
    expect(getSeriesProgress(series).published).toBe(0);
  });

  it("reports total as the highest published lesson number", () => {
    expect(getSeriesProgress(series).total).toBe(33);
  });

  it("reports curriculum as the final planned count (the real gap driver)", () => {
    const p = getSeriesProgress(series);
    expect(p.curriculum).toBe(90);
    // The constellation gap the syllabus shows is curriculum - published.
    expect(p.curriculum - p.published).toBe(90);
  });

  it("falls back to totalLessons when curriculumLessons is undeclared", () => {
    const undeclared = { ...series } as LearningSeries;
    delete (undeclared as { curriculumLessons?: number }).curriculumLessons;
    expect(getSeriesProgress(undeclared).curriculum).toBe(33);
  });
});
