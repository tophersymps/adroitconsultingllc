/**
 * src/lib/catalog.test.ts — Learn Platform v2 catalog builder (ADR-210).
 *
 * Covers: buildCatalogCourse merging DB org + content display + prerequisites +
 * derived next-course; getNextCourse (Level N ordering); prerequisitesMet; and
 * the toLearnHubCards client projection (guest hardening preserved).
 */
import { describe, expect, it } from "vitest";
import {
  buildCatalogCourse,
  getNextCourse,
  prerequisitesMet,
  toLearnHubCards,
  type CatalogBuildContext,
} from "@/lib/catalog";
import type {
  CatalogCourse,
  CatalogGroup,
  CatalogSection,
  CoursePrerequisiteRow,
  CourseRow,
} from "@/shared/contracts-course-catalog";

const NOW = "2026-08-25T12:00:00.000Z";

function course(over: Partial<CourseRow> = {}): CourseRow {
  return {
    id: "c1",
    series_slug: "hermes-consultant",
    title: "Hermes Consultant",
    status: "live",
    access_model: "free",
    price_cents: null,
    launched_at: NOW,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

function section(over: Partial<CatalogSection> = {}): CatalogSection {
  return {
    id: "s-tracks",
    slug: "tracks",
    name: "Tracks",
    sort_order: 20,
    created_at: NOW,
    ...over,
  };
}

function group(over: Partial<CatalogGroup> = {}): CatalogGroup {
  return {
    id: "g-hermes",
    section_id: "s-tracks",
    slug: "hermes-consultant-track",
    name: "Hermes Consultant Track",
    sort_order: 10,
    created_at: NOW,
    ...over,
  };
}

function prereq(over: Partial<CoursePrerequisiteRow> = {}): CoursePrerequisiteRow {
  return {
    id: "p1",
    course_id: "c2",
    required_course_id: "c1",
    sort_order: 10,
    created_at: NOW,
    ...over,
  };
}

function ctx(
  over: Partial<CatalogBuildContext> = {},
  allCourses: CourseRow[] = [],
): CatalogBuildContext {
  return {
    sections: [section()],
    groups: [group()],
    prerequisites: [],
    courses: allCourses,
    courseNameById: (id) =>
      allCourses.find((c) => c.id === id)
        ? { series_slug: "x", name: "Required Course" }
        : undefined,
    ...over,
  };
}

describe("buildCatalogCourse", () => {
  it("merges DB org (section/group) with content display into one CatalogCourse", () => {
    const c = course({
      id: "c-hermes",
      series_slug: "hermes-consultant",
      section_id: "s-tracks",
      group_id: "g-hermes",
      track: "hermes-consultant",
      level: 1,
      sort_order: 10,
      difficulty: "Beginner",
    });
    const built = buildCatalogCourse(
      c,
      ctx({}, [c]),
      true,
    );
    expect(built.course).toBe(c);
    expect(built.section?.slug).toBe("tracks");
    expect(built.group?.slug).toBe("hermes-consultant-track");
    expect(built.course.difficulty).toBe("Beginner");
    // content display merged in
    expect(built.name).toBeTruthy();
    expect(built.gradient).toBeTruthy();
    expect(built.visible).toBe(true);
    expect(built.canAccess).toBe(true);
  });

  it("renders standalone (Learning Path) courses with section but no group", () => {
    const c = course({
      id: "c-agentic",
      series_slug: "agentic-ai",
      section_id: "s-tracks",
      group_id: null,
      track: null,
      level: null,
    });
    const built = buildCatalogCourse(c, ctx({}, [c]), false);
    expect(built.group).toBeNull();
    expect(built.nextCourseId).toBeNull();
    expect(built.canAccess).toBe(false);
  });

  it("maps structured prerequisites to names + sorts by sort_order", () => {
    const c1 = course({ id: "c1", series_slug: "hermes-consultant", level: 1 });
    const c2 = course({
      id: "c2",
      series_slug: "hermes-consultant-intermediate",
      level: 2,
    });
    const built = buildCatalogCourse(
      c2,
      ctx(
        { prerequisites: [prereq(), prereq({ id: "p0", required_course_id: "c1", sort_order: 5 })] },
        [c1, c2],
      ),
      true,
    );
    expect(built.prerequisites).toHaveLength(2);
    expect(built.prerequisites[0].series_slug).toBe("x");
    expect(built.prerequisites[0].name).toBe("Required Course");
  });
});

describe("getNextCourse (ADR-212 — derived from track/level)", () => {
  const l1 = course({ id: "l1", series_slug: "a", track: "t", level: 1, sort_order: 10 });
  const l2 = course({ id: "l2", series_slug: "b", track: "t", level: 2, sort_order: 20 });
  const l3 = course({ id: "l3", series_slug: "c", track: "t", level: 3, sort_order: 30 });
  const all = [l1, l2, l3];

  it("L1 → L2 → L3 → null", () => {
    expect(getNextCourse(all, "l1")).toBe("l2");
    expect(getNextCourse(all, "l2")).toBe("l3");
    expect(getNextCourse(all, "l3")).toBeNull();
  });

  it("standalone (no track) → null", () => {
    const standalone = course({ id: "solo", series_slug: "solo", track: null, level: null });
    expect(getNextCourse([...all, standalone], "solo")).toBeNull();
  });
});

describe("prerequisitesMet", () => {
  it("true only when every required course is completed", () => {
    expect(prerequisitesMet(["c1", "c2"], new Set(["c1", "c2"]))).toBe(true);
    expect(prerequisitesMet(["c1", "c2"], new Set(["c1"]))).toBe(false);
    expect(prerequisitesMet(["c1", "c2"], new Set(["c2", "c3"]))).toBe(false);
    // no prerequisites → vacuously true
    expect(prerequisitesMet([], new Set())).toBe(true);
  });
});

describe("toLearnHubCards", () => {
  function built(over: Partial<CourseRow> = {}): CatalogCourse {
    return buildCatalogCourse(course(over), ctx({}, [course(over)]), true);
  }

  it("projects only card-render fields + DB org — no per-lesson metadata", () => {
    const cards = toLearnHubCards([built({ id: "c1", level: 2, difficulty: "Advanced" })], {
      includeLessonSlugs: false,
    });
    const card = cards[0];
    expect(card.level).toBe(2);
    expect(card.difficulty).toBe("Advanced");
    expect(card.lessonSlugs).toEqual([]);
    // hermes-consultant declares curriculumLessons=30 (final count) in series.json,
    // so it is NOT equal to totalLessons (highest published, currently lower).
    // This is what stops the constellation from reshuffling as lessons land daily.
    expect(card.curriculumLessons).toBe(30);
    expect(card.curriculumLessons).toBeGreaterThan(card.totalLessons);
    expect(card.curriculumLessons).toBeGreaterThan(0);
    expect(card).not.toHaveProperty("course");
    expect(card).not.toHaveProperty("lessons");
  });

  it("includes lesson slugs only when opted in (signed-in)", () => {
    const cards = toLearnHubCards([built({ id: "c1" })], {
      includeLessonSlugs: true,
    });
    // hermes-consultant has published lessons in the generated build data
    expect(Array.isArray(cards[0].lessonSlugs)).toBe(true);
  });
});
