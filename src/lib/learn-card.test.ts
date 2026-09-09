import { describe, expect, it } from "vitest";
import { toLearnCardSeries } from "@/lib/learn";
import type { LearningSeries } from "@/data/types";

/** Full source series — includes per-lesson metadata that must NOT ship. */
const fullSeries: LearningSeries = {
  slug: "salesforce-architect",
  name: "Salesforce Architect Path",
  description: "A structured path to the Salesforce Architect certification.",
  gradient: "from-sky to-blue-600",
  totalLessons: 42,
  curriculumLessons: 60,
  lessons: [
    {
      slug: "what-is-solution-architecture",
      title: "What is Solution Architecture?",
      series: "salesforce-architect",
      lesson: 1,
      excerpt: "A lesson excerpt that must not reach the guest bundle.",
      date: "August 10, 2026",
      author: "Adroit Consulting",
      readTime: "5 min read",
      tags: ["architecture", "certification"],
    },
    {
      slug: "integration-patterns",
      title: "Integration Patterns",
      series: "salesforce-architect",
      lesson: 2,
      excerpt: "Another private excerpt.",
      date: "August 11, 2026",
      author: "Adroit Consulting",
      readTime: "4 min read",
      tags: ["integration"],
    },
  ],
};

describe("toLearnCardSeries (guest payload hardening t_3dbf4826)", () => {
  it("guest projection carries only card-render fields — no per-lesson metadata", () => {
    const card = toLearnCardSeries(fullSeries);

    // Card-render fields preserved.
    expect(card.slug).toBe("salesforce-architect");
    expect(card.name).toBe("Salesforce Architect Path");
    expect(card.description).toBe(
      "A structured path to the Salesforce Architect certification.",
    );
    expect(card.gradient).toBe("from-sky to-blue-600");
    expect(card.lessonCount).toBe(2);
    expect(card.totalLessons).toBe(42);
    expect(card.curriculumLessons).toBe(60);
    // Content-derived series carry no org (ADR-207) — the hub page fills these
    // from the DB-backed CatalogCourse, so toLearnCardSeries leaves them null.
    expect(card.section).toBeNull();
    expect(card.group).toBeNull();
    expect(card.track).toBeNull();
    expect(card.level).toBeNull();

    // Guests never receive lesson slugs (SeriesProgress is signed-in only).
    expect(card.lessonSlugs).toEqual([]);

    // The full lessons array (with slug/title/excerpt/date/author/readTime/tags)
    // is absent from the projection entirely.
    expect(card).not.toHaveProperty("lessons");
  });

  it("signed-in projection includes lesson slugs for SeriesProgress only", () => {
    const card = toLearnCardSeries(fullSeries, { includeLessonSlugs: true });
    expect(card.lessonSlugs).toEqual([
      "what-is-solution-architecture",
      "integration-patterns",
    ]);
    // Still no per-lesson metadata in the card payload.
    expect(card).not.toHaveProperty("lessons");
  });

  it("lessonCount reflects published lessons even when slugs are stripped", () => {
    const guest = toLearnCardSeries(fullSeries);
    expect(guest.lessonCount).toBe(fullSeries.lessons.length);
    // The count badge stays correct while the slugs stay empty for guests.
    expect(guest.lessonSlugs).toHaveLength(0);
  });

  it("handles an empty-lesson series (Coming soon card state)", () => {
    const card = toLearnCardSeries({ ...fullSeries, lessons: [] });
    expect(card.lessonCount).toBe(0);
    expect(card.lessonSlugs).toEqual([]);
  });
});
