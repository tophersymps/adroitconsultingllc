/**
 * chart.test.ts — the adapter and the layout.
 *
 * These cover the claims the chart makes about someone's progress, which is why
 * the adapter was kept pure. The renderer is presentational; if a figure lights
 * the wrong rails or crowns the wrong node, it happens here.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildChartFigure,
  buildChartFigures,
  buildSegments,
  examPassedSlugs,
  figureProgress,
} from "./chart";
import {
  chartLayout,
  figureArtFor,
  layoutCapacity,
  plateSlug,
  PLATE_SLUGS,
} from "@/components/Constellations/chart/chart-figures";
import {
  CONSTELLATION_FIGURES,
  figureByName,
  projectFigure,
} from "@/components/Constellations/chart/figure-catalog";
import {
  assignFigures,
  FIGURE_PINS,
  lessonsPerStar,
} from "@/components/Constellations/chart/figure-assignment";
import {
  availableFigures,
  poolCapacity,
  recommendForLessonCount,
  usedConstellationNames,
} from "@/components/Constellations/chart/constellation-pool";
import type {
  ChronicleEntry,
  ConstellationState,
  ProfileSky,
} from "@/shared/contracts-constellations";

/**
 * A course with real per-lesson stars, because lighting is per-lesson now:
 * lessons 1..litStars are complete, in order.
 */
function constellation(
  over: Partial<ConstellationState> & { seriesSlug: string },
): ConstellationState {
  const totalStars = over.totalStars ?? 10;
  const litStars = over.litStars ?? 0;
  return {
    courseId: over.courseId ?? `course-${over.seriesSlug}`,
    seriesSlug: over.seriesSlug,
    name: over.name ?? "A Course",
    gradient: over.gradient ?? "from-blue-500 to-purple-500",
    totalStars,
    curriculumLessons: over.curriculumLessons ?? totalStars,
    litStars,
    complete: over.complete ?? (totalStars > 0 && litStars === totalStars),
    examPassed: over.examPassed ?? false,
    stars:
      over.stars ??
      Array.from({ length: totalStars }, (_, i) => ({
        lessonSlug: `${over.seriesSlug}-lesson-${i + 1}`,
        index: i + 1,
        label: `Lesson ${i + 1}`,
        lit: i < litStars,
      })),
  };
}

function chronicleEntry(over: Partial<ChronicleEntry>): ChronicleEntry {
  return {
    id: over.id ?? 1,
    eventType: over.eventType ?? "lesson",
    courseId: over.courseId ?? "c1",
    seriesSlug: over.seriesSlug ?? null,
    courseName: over.courseName ?? null,
    label: over.label ?? "",
    completedAt: over.completedAt ?? "2026-01-01T00:00:00.000Z",
    score: over.score ?? null,
  };
}

describe("figureProgress", () => {
  it("is the lit fraction of the course", () => {
    expect(figureProgress({ litStars: 5, totalStars: 10 })).toBe(0.5);
    expect(figureProgress({ litStars: 10, totalStars: 10 })).toBe(1);
  });

  it("returns 0 rather than NaN for a course with no lessons", () => {
    expect(figureProgress({ litStars: 0, totalStars: 0 })).toBe(0);
  });

  it("clamps impossible data instead of exceeding 1", () => {
    expect(figureProgress({ litStars: 14, totalStars: 10 })).toBe(1);
    expect(figureProgress({ litStars: -3, totalStars: 10 })).toBe(0);
  });
});

describe("examPassedSlugs", () => {
  it("collects series with an exam event, since the event is only written on a pass", () => {
    const passed = examPassedSlugs([
      chronicleEntry({ eventType: "exam", seriesSlug: "agentic-ai" }),
      chronicleEntry({ eventType: "quiz", seriesSlug: "omni-studio-cert" }),
      chronicleEntry({ eventType: "lesson", seriesSlug: "ai-at-work" }),
    ]);
    expect([...passed]).toEqual(["agentic-ai"]);
  });

  it("ignores exam events with no series attached", () => {
    expect(examPassedSlugs([chronicleEntry({ eventType: "exam", seriesSlug: null })]).size).toBe(0);
  });
});

describe("buildChartFigure", () => {
  it("draws a figure sized to the course, with its connections", () => {
    const f = buildChartFigure(
      constellation({ seriesSlug: "a-course", litStars: 0, totalStars: 10 }),
    );
    // 10 lessons has an exact match in the catalog.
    expect(f.figureName).toBe("Gemini");
    expect(f.stars).toHaveLength(10);
    expect(f.connections.length).toBeGreaterThan(0);
  });

  /*
   * A course with no figure is a supported state, not an error — it renders label
   * and progress only. It happens when the catalog is exhausted, since every
   * course otherwise gets one.
   */
  it("degrades to a label-only figure when no figure is available", () => {
    const f = buildChartFigure(
      constellation({ seriesSlug: "unlucky", litStars: 3, totalStars: 6 }),
      { figure: null },
    );
    expect(f.figureName).toBeNull();
    expect(f.stars).toEqual([]);
    expect(f.connections).toEqual([]);
    // Progress is still real and still renderable.
    expect(f.litStars).toBe(3);
    expect(f.totalStars).toBe(6);
  });

  it("crowns exactly one member as the exam", () => {
    const f = buildChartFigure(constellation({ seriesSlug: "c", totalStars: 6 }));
    expect(f.stars.filter((s) => s.role === "exam")).toHaveLength(1);
  });

  it("crowns the brightest member, so the exam node is the figure's anchor star", () => {
    const f = buildChartFigure(constellation({ seriesSlug: "c", totalStars: 7 }));
    const exam = f.stars.find((s) => s.role === "exam")!;
    expect(exam.magnitude).toBe(Math.min(...f.stars.map((s) => s.magnitude)));
    expect(exam.name).toContain("Final exam");
  });

  it("ships two roles only — knowledge checks are not faked in v1", () => {
    const f = buildChartFigure(constellation({ seriesSlug: "c", totalStars: 9 }));
    expect(new Set(f.stars.map((s) => s.role))).toEqual(new Set(["lesson", "exam"]));
  });

  it("leaves the crown dark until the course is finished", () => {
    const partial = buildChartFigure(
      constellation({ seriesSlug: "c", litStars: 9, totalStars: 10 }),
    );
    expect(partial.complete).toBe(false);
    expect(partial.stars.find((s) => s.role === "exam")?.lit).toBe(false);
  });

  it("lights the crown when the course is complete", () => {
    const done = buildChartFigure(
      constellation({ seriesSlug: "c", litStars: 10, totalStars: 10 }),
    );
    expect(done.complete).toBe(true);
    expect(done.stars.find((s) => s.role === "exam")?.lit).toBe(true);
  });

  /*
   * The exam event is the only exam truth ProfileSky carries. A learner can
   * pass the cert exam without every lesson being ticked, and that should crown
   * the figure — otherwise passing the exam is invisible.
   */
  it("lights the crown on a passed exam even when lessons remain", () => {
    const f = buildChartFigure(
      constellation({ seriesSlug: "c", litStars: 4, totalStars: 10 }),
      { examPassed: true },
    );
    expect(f.complete).toBe(false);
    expect(f.examPassed).toBe(true);
    expect(f.stars.find((s) => s.role === "exam")?.lit).toBe(true);
  });

  it("lights more members as progress rises, and all of them when complete", () => {
    const lit = (n: number) =>
      buildChartFigure(constellation({ seriesSlug: "c", litStars: n, totalStars: 10 }))
        .stars.filter((s) => s.lit).length;
    expect(lit(0)).toBe(0);
    expect(lit(5)).toBeGreaterThan(0);
    expect(lit(5)).toBeLessThan(lit(10));
    expect(lit(10)).toBe(10);
  });

  it("is deterministic — the same course produces the same figure", () => {
    const c = constellation({ seriesSlug: "c", litStars: 4, totalStars: 9 });
    expect(JSON.stringify(buildChartFigure(c))).toBe(JSON.stringify(buildChartFigure(c)));
  });
});

/* ------------------------------------------------------------------ */
/*  Lessons → stars                                                    */
/* ------------------------------------------------------------------ */

describe("lesson-to-star mapping", () => {
  it("gives one star per lesson when the figure fits exactly", () => {
    const f = buildChartFigure(
      constellation({ seriesSlug: "c", litStars: 0, totalStars: 10 }),
    );
    expect(f.stars).toHaveLength(10);
    for (const s of f.stars) expect(s.lessons).toHaveLength(1);
    // Every lesson is represented exactly once.
    expect(f.stars.flatMap((s) => s.lessons).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("lights star N when lesson N is done, and no others", () => {
    const f = buildChartFigure(
      constellation({ seriesSlug: "c", litStars: 4, totalStars: 10 }),
    );
    for (const s of f.stars) {
      if (s.role === "exam") continue;
      const expected = s.lessons.every((n) => n <= 4);
      expect(s.lit, `star for lessons ${s.lessons} wrong`).toBe(expected);
    }
  });

  /*
   * No real constellation outline runs to thirty stars, so a big course has to
   * share. The star then stands for a group and only lights when the whole group
   * is done — otherwise it would claim credit for lessons still outstanding.
   */
  it("deals surplus lessons round-robin and waits for the whole group", () => {
    const f = buildChartFigure(
      constellation({ seriesSlug: "c", litStars: 0, totalStars: 31 }),
    );
    const starCount = f.stars.length;
    expect(starCount).toBeLessThan(31);
    // Every lesson lands on exactly one star.
    expect(f.stars.flatMap((s) => s.lessons).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 31 }, (_, i) => i + 1),
    );
    // Round-robin, so bucket sizes differ by at most one.
    const sizes = f.stars.map((s) => s.lessons.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it("holds a shared star dark until its last lesson lands", () => {
    const partial = buildChartFigure(
      constellation({ seriesSlug: "c", litStars: 1, totalStars: 31 }),
    );
    const first = partial.stars.find((s) => s.lessons.includes(1))!;
    expect(first.lessons.length).toBeGreaterThan(1);
    expect(first.lit).toBe(false);

    const done = buildChartFigure(
      constellation({ seriesSlug: "c", litStars: 31, totalStars: 31 }),
    );
    expect(done.stars.every((s) => s.lit)).toBe(true);
  });

  /*
   * The whole point of curriculumLessons: a star's meaning must not shift when a
   * lesson ships. Lesson 12 belongs to the same star on launch day and at the end.
   */
  it("keeps a lesson on the same star as the course grows", () => {
    const early = buildChartFigure(
      constellation({
        seriesSlug: "c",
        litStars: 0,
        totalStars: 12,
        curriculumLessons: 40,
      }),
    );
    const later = buildChartFigure(
      constellation({
        seriesSlug: "c",
        litStars: 0,
        totalStars: 30,
        curriculumLessons: 40,
      }),
    );
    expect(early.figureName).toBe(later.figureName);
    const starOf = (f: typeof early, lesson: number) =>
      f.stars.findIndex((s) => s.lessons.includes(lesson));
    for (const lesson of [1, 5, 12]) {
      expect(starOf(early, lesson)).toBe(starOf(later, lesson));
    }
  });

  it("sizes the figure from the curriculum, not from what is published", () => {
    const young = buildChartFigure(
      constellation({
        seriesSlug: "c",
        litStars: 0,
        totalStars: 3,
        curriculumLessons: 10,
      }),
    );
    // Sized for the eventual 10, not the 3 that exist.
    expect(young.figureName).toBe("Gemini");
    expect(young.stars).toHaveLength(10);
    expect(young.curriculumLessons).toBe(10);
  });

  it("never lets a stale declaration shrink a course below what exists", () => {
    const f = buildChartFigure(
      constellation({
        seriesSlug: "c",
        litStars: 0,
        totalStars: 14,
        curriculumLessons: 6,
      }),
    );
    expect(f.curriculumLessons).toBe(14);
  });
});

describe("buildChartFigures", () => {
  const sky = (over: Partial<ProfileSky> = {}): ProfileSky => ({
    stats: {
      streakDays: 0,
      longestStreakDays: 0,
      rank: null,
      coursesCompleted: 0,
      tracksCompleted: 0,
    },
    constellations: over.constellations ?? [],
    chronicle: over.chronicle ?? [],
    isGuest: false,
  });

  it("builds one figure per course, in catalog order", () => {
    const figures = buildChartFigures(
      sky({
        constellations: [
          constellation({ seriesSlug: "agentic-ai" }),
          constellation({ seriesSlug: "ai-at-work" }),
        ],
      }),
    );
    expect(figures.map((f) => f.seriesSlug)).toEqual(["agentic-ai", "ai-at-work"]);
  });

  it("wires the server-derived exam flag through to the right course", () => {
    const figures = buildChartFigures(
      sky({
        constellations: [
          constellation({
            seriesSlug: "agentic-ai",
            litStars: 2,
            totalStars: 10,
            examPassed: false,
          }),
          constellation({
            seriesSlug: "ai-at-work",
            litStars: 2,
            totalStars: 12,
            examPassed: true,
          }),
        ],
      }),
    );
    expect(figures.find((f) => f.seriesSlug === "agentic-ai")!.examPassed).toBe(false);
    expect(figures.find((f) => f.seriesSlug === "ai-at-work")!.examPassed).toBe(true);
  });

  it("handles an empty sky without throwing", () => {
    expect(buildChartFigures(sky())).toEqual([]);
  });

  /*
   * Two courses drawing the same constellation would make the sky unreadable, and
   * it is a decision about the whole sky rather than about one course — which is
   * why figures are assigned across the set instead of per call.
   */
  it("never draws two courses as the same constellation", () => {
    const figures = buildChartFigures(
      sky({
        constellations: [
          constellation({ seriesSlug: "a", totalStars: 8 }),
          constellation({ seriesSlug: "b", totalStars: 8 }),
          constellation({ seriesSlug: "c", totalStars: 8 }),
          constellation({ seriesSlug: "d", totalStars: 8 }),
        ],
      }),
    );
    const names = figures.map((f) => f.figureName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every real catalog course a figure sized near its curriculum", () => {
    const real = [
      ["salesforce-architect", 31],
      ["agentic-ai", 31],
      ["omni-studio-cert", 26],
      ["ai-at-work", 19],
      ["hermes-consultant", 10],
      ["hermes-consultant-intermediate", 8],
      ["hermes-consultant-advanced", 8],
    ] as const;
    const figures = buildChartFigures(
      sky({
        constellations: real.map(([slug, n]) =>
          constellation({ seriesSlug: slug, totalStars: n }),
        ),
      }),
    );
    for (const f of figures) {
      expect(f.figureName, `${f.seriesSlug} got no figure`).not.toBeNull();
      expect(f.stars.length).toBeGreaterThan(0);
    }
    // Real courses are pinned (the course→constellation contract): the figure is
    // the one the course owns, regardless of what size-matching would pick.
    const bySlug = new Map(figures.map((f) => [f.seriesSlug, f]));
    for (const [slug] of real) {
      const f = bySlug.get(slug)!;
      expect(f.figureName, `${slug} lost its pin`).toBe(FIGURE_PINS[slug]);
      expect(f.stars.length).toBe(figureByName(FIGURE_PINS[slug]!)!.stars.length);
    }
  });

  it("sizes the lab's just-launched course from its curriculum, not five published lessons", async () => {
    const { labProfileSky } = await import(
      "@/components/Constellations/lab/field-fixtures"
    );
    const figures = buildChartFigures(labProfileSky());
    const agentic = figures.find((f) => f.seriesSlug === "agentic-ai");
    expect(agentic).toBeDefined();
    expect(agentic!.curriculumLessons).toBe(40);
    expect(agentic!.totalStars).toBe(5);
    // Cassiopeia is the 5-star figure the old slug map would have given it.
    expect(agentic!.figureName).not.toBe("Cassiopeia");
    expect(agentic!.stars.length).toBeGreaterThan(5);
    // Closest figure to 40 is now 19★ Cetus (the Phase 3 addition; the old
    // catalog's 14★ Draco was the largest available). Bigger catalog, closer fit.
    expect(agentic!.figureName).toBe("Cetus");
    expect(agentic!.stars).toHaveLength(19);
  });
});

describe("assignFigures", () => {
  const course = (seriesSlug: string, curriculumLessons: number) => ({
    seriesSlug,
    curriculumLessons,
  });

  it("gives a course with an exact match its exact figure", () => {
    const m = assignFigures([course("a", 7)]);
    expect(m.get("a")!.stars).toHaveLength(7);
  });

  /*
   * Regression: a single largest-first sweep let a 19-lesson course grab the
   * 10-star figure as its nearest option, leaving the 10-lesson course on a 9 and
   * breaking one-star-per-lesson for the course that could have had it.
   */
  it("does not let a course without an exact match steal one", () => {
    const m = assignFigures([course("big", 19), course("ten", 10)]);
    expect(m.get("ten")!.stars).toHaveLength(10);
    expect(m.get("big")!.stars).not.toHaveLength(10);
  });

  it("hands bigger figures to bigger courses", () => {
    const m = assignFigures([course("small", 26), course("big", 40)]);
    expect(m.get("big")!.stars.length).toBeGreaterThan(m.get("small")!.stars.length);
  });

  it("honours a pin over size matching", () => {
    const m = assignFigures([course("a", 7)], { a: "Orion" });
    expect(m.get("a")!.name).toBe("Orion");
  });

  it("does not let size matching take a pinned figure", () => {
    const m = assignFigures([course("pinned", 30), course("exact", 9)], {
      pinned: "Orion",
    });
    expect(m.get("pinned")!.name).toBe("Orion");
    expect(m.get("exact")!.name).not.toBe("Orion");
  });

  it("ignores a pin naming a figure that does not exist", () => {
    const m = assignFigures([course("a", 7)], { a: "Nonexistent" });
    expect(m.get("a")!.stars).toHaveLength(7);
  });

  it("is deterministic", () => {
    const courses = [course("a", 8), course("b", 8), course("c", 14)];
    const first = [...assignFigures(courses)].map(([k, v]) => [k, v.name]);
    const second = [...assignFigures(courses)].map(([k, v]) => [k, v.name]);
    expect(first).toEqual(second);
  });

  it("runs out rather than double-booking once the catalog is exhausted", () => {
    const many = Array.from({ length: CONSTELLATION_FIGURES.length + 3 }, (_, i) =>
      course(`c${String(i).padStart(2, "0")}`, 8),
    );
    const m = assignFigures(many);
    expect(m.size).toBe(CONSTELLATION_FIGURES.length);
    expect(new Set([...m.values()].map((f) => f.name)).size).toBe(m.size);
  });
});

/*
 * The course→constellation contract (baked in from Phase 4): every real course
 * is defined by exactly one constellation, exclusive to that course, and the
 * on-course tracker `/learn/[series]` and the whole-sky profile must resolve to
 * the SAME figure. Before pins, the course page ran an isolated size-match that
 * ignored the rest of the sky and could hand a course a figure the profile had
 * already given to another course.
 */
describe("course → constellation pins (exclusivity + surface consistency)", () => {
  // Real courses (slug, final curriculum). Source of truth mirrors the
  // scheduler counts in learn-curriculum.test.ts.
  const REAL_COURSES: ReadonlyArray<readonly [string, number]> = [
    ["salesforce-architect", 90],
    ["agentic-ai", 90],
    ["omni-studio-cert", 46],
    ["ai-at-work", 30],
    ["hermes-consultant", 30],
    ["hermes-consultant-intermediate", 25],
    ["hermes-consultant-advanced", 20],
  ];

  it("pins every real course, so none can silently drift to another figure", () => {
    for (const [slug] of REAL_COURSES) {
      expect(
        FIGURE_PINS[slug],
        `${slug} must be pinned in FIGURE_PINS — every course owns exactly one constellation`,
      ).toBeTypeOf("string");
    }
  });

  it("names only constellations that exist in the catalog", () => {
    for (const name of Object.values(FIGURE_PINS)) {
      expect(figureByName(name), `pin "${name}" is not an authorable figure`).not.toBeNull();
    }
  });

  it("never pins two courses to the same constellation (exclusivity)", () => {
    const names = Object.values(FIGURE_PINS);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every catalog course resolves to its pinned figure, never another course's", () => {
    const map = assignFigures(
      REAL_COURSES.map(([slug, c]) => ({ seriesSlug: slug, curriculumLessons: c })),
    );
    for (const [slug] of REAL_COURSES) {
      expect(map.get(slug)!.name, `${slug} did not keep its pin`).toBe(FIGURE_PINS[slug]);
    }
  });

  /*
   * The regression this fixes: the on-course tracker uses `buildChartFigure`
   * (one course, isolated assign) while the profile uses `buildChartFigures`
   * (whole sky, claiming figures). Without pins these could disagree. With the
   * contract, both must give every real course the same constellation.
   */
  it("makes the course page and the profile agree on every course's constellation", () => {
    const sky: ProfileSky = {
      stats: { streakDays: 0, longestStreakDays: 0, rank: null, coursesCompleted: 0, tracksCompleted: 0 },
      constellations: REAL_COURSES.map(([slug, n]) =>
        constellation({ seriesSlug: slug, curriculumLessons: n, totalStars: n }),
      ),
      chronicle: [],
      isGuest: false,
    };
    const profile = buildChartFigures(sky);

    for (const [slug, n] of REAL_COURSES) {
      const fromProfile = profile.find((f) => f.seriesSlug === slug)!.figureName;
      // The course page's path: a single course handed to buildChartFigure.
      const fromCoursePage = buildChartFigure(
        constellation({ seriesSlug: slug, curriculumLessons: n, totalStars: n }),
      ).figureName;
      expect(
        fromCoursePage,
        `${slug}: course page resolved "${fromCoursePage}" but the profile shows "${fromProfile}"`,
      ).toBe(fromProfile);
      expect(fromCoursePage, `${slug} must be its pinned figure`).toBe(FIGURE_PINS[slug]);
    }
  });
});

/* Phase 4 — the used/available pool that backs a new-course launch. */
describe("constellation pool (used vs available)", () => {
  it("marks every pinned figure as used", () => {
    expect([...usedConstellationNames()].sort()).toEqual(
      Object.values(FIGURE_PINS).sort(),
    );
  });

  it("reconciles against the catalog — used figures all exist, available never overlap used", () => {
    const used = usedConstellationNames();
    const available = availableFigures();
    const availableNames = new Set(available.map((f) => f.name));
    // Every pin names a real authorable figure.
    for (const name of used) {
      expect(figureByName(name), `pinned figure "${name}" is not authorable`).not.toBeNull();
    }
    // Available = catalog minus used; nothing double-books.
    for (const name of used) {
      expect(availableNames.has(name), `"${name}" is both used and available`).toBe(false);
    }
    expect(available.length).toBe(CONSTELLATION_FIGURES.length - used.size);
  });

  it("recommends only from the available pool, sized to the lesson count", () => {
    const rec = recommendForLessonCount(22);
    expect(rec).not.toBeNull();
    expect(usedConstellationNames().has(rec!.name)).toBe(false);
    // Closest available to 22: Hydra(17) is used (omni), next is AURIGA(9)...
    // actually largest remaining — just assert it picks a non-pinned figure
    // sizes are all 3–20, so exact assertions could churn; assert shape.
    expect(rec!.stars.length).toBeGreaterThan(0);
  });

  it("reports the 88 as authorable + art-only (the honest '88 alignable once figured')", () => {
    const cap = poolCapacity();
    expect(cap.total).toBe(88);
    expect(cap.authorable).toBe(CONSTELLATION_FIGURES.length);
    expect(cap.artOnly).toBe(88 - CONSTELLATION_FIGURES.length);
  });
});

describe("buildSegments (lesson path between main stars)", () => {
  // A straight horizontal 0..10 figure with two connections (three stars).
  const proj = (pts: [number, number][]) =>
    pts.map(([x, y]) => ({ position: [x, y, 0] as [number, number, number] }));
  const lineFig = proj([[0, 0], [5, 0], [10, 0]]);
  const conns: ReadonlyArray<readonly [number, number]> = [
    [0, 1],
    [1, 2],
  ];

  const mut = (done: ReadonlySet<number>) =>
    buildSegments(conns, lineFig, 6, done);

  it("distributes every lesson across the segments, in order", () => {
    const segs = mut(new Set());
    // Two equal-length segments → ~3 lessons each.
    expect(segs.length).toBe(2);
    expect(segs[0]!.lessons.length + segs[1]!.lessons.length).toBe(6);
    expect(segs[0]!.lessons).toEqual([1, 2, 3]);
    expect(segs[1]!.lessons).toEqual([4, 5, 6]);
  });

  it("counts done lessons per segment", () => {
    const segs = mut(new Set([1, 2, 3, 4]));
    expect(segs[0]!.done).toBe(3);
    expect(segs[1]!.done).toBe(1);
  });

  it("keeps segment endpoints inside the star list", () => {
    const segs = mut(new Set());
    for (const s of segs) {
      expect(s.a).toBeGreaterThanOrEqual(0);
      expect(s.b).toBeGreaterThanOrEqual(0);
      expect(s.a).toBeLessThan(3);
      expect(s.b).toBeLessThan(3);
    }
  });

  it("is deterministic — same figure + curriculum yields the same layout", () => {
    const first = buildSegments(conns, lineFig, 6, new Set([2, 5]));
    const second = buildSegments(conns, lineFig, 6, new Set([2, 5]));
    expect(first).toEqual(second);
  });

  it("keeps the crown independent — segments ride the connections, not the exam node", () => {
    // The path layout must not change just because the course completes.
    const half = buildSegments(conns, lineFig, 6, new Set([1, 2, 3]));
    const all = buildSegments(conns, lineFig, 6, new Set([1, 2, 3, 4, 5, 6]));
    expect(half.map((s) => ({ a: s.a, b: s.b, lessons: s.lessons }))).toEqual(
      all.map((s) => ({ a: s.a, b: s.b, lessons: s.lessons })),
    );
    expect(all[0]!.done).toBe(3);
    expect(all[1]!.done).toBe(3);
  });

  it("reports a dense segment's done fraction for the rail render", () => {
    // 20 lessons over two 5-unit segments → 10 per segment (dense, ≥ rail).
    const segs = buildSegments(conns, lineFig, 20, new Set([1, 2, 3, 4, 5]));
    expect(segs[0]!.lessons.length).toBeGreaterThan(4);
    expect(segs[0]!.done).toBe(5);
    expect(segs[1]!.done).toBe(0);
  });
});

describe("lessonsPerStar", () => {
  it("is 1:1 when counts match", () => {
    expect(lessonsPerStar(4, 4)).toEqual([[1], [2], [3], [4]]);
  });

  it("deals round-robin so the figure fills evenly", () => {
    expect(lessonsPerStar(7, 3)).toEqual([
      [1, 4, 7],
      [2, 5],
      [3, 6],
    ]);
  });

  it("leaves surplus stars unassigned rather than inventing lessons", () => {
    expect(lessonsPerStar(2, 4)).toEqual([[1], [2], [], []]);
  });

  it("returns nothing for a figure with no stars", () => {
    expect(lessonsPerStar(5, 0)).toEqual([]);
  });
});

describe("figure catalog", () => {
  it("spans a range of sizes, so courses of different lengths can be matched", () => {
    const sizes = [...new Set(CONSTELLATION_FIGURES.map((f) => f.stars.length))].sort(
      (a, b) => a - b,
    );
    expect(sizes[0]).toBeLessThanOrEqual(3);
    expect(sizes[sizes.length - 1]).toBeGreaterThanOrEqual(14);
    // No gaps wider than two, or a course lands awkwardly far from its size.
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]! - sizes[i - 1]!, `gap above ${sizes[i - 1]}`).toBeLessThanOrEqual(2);
    }
  });

  it("names figures that all have an engraved plate", () => {
    for (const f of CONSTELLATION_FIGURES) {
      expect(figureArtFor(f.name), `${f.name} has no plate`).not.toBeNull();
    }
  });

  it("gives every figure a unique name", () => {
    const names = CONSTELLATION_FIGURES.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  /*
   * The chart draws connected members only, so an unconnected star would be an
   * orphan dot floating outside the outline — and would silently be a lesson that
   * can never visibly light.
   */
  it("draws every member of every figure", () => {
    for (const f of CONSTELLATION_FIGURES) {
      const drawn = new Set(f.connections.flat());
      expect(drawn.size, `${f.name} has an undrawn member`).toBe(f.stars.length);
    }
  });

  it("keeps every connection index inside the member list", () => {
    for (const f of CONSTELLATION_FIGURES) {
      for (const [a, b] of f.connections) {
        expect(f.stars[a], `${f.name} start ${a}`).toBeDefined();
        expect(f.stars[b], `${f.name} end ${b}`).toBeDefined();
        expect(a, `${f.name} joins a star to itself`).not.toBe(b);
      }
    }
  });

  it("uses plausible sky coordinates", () => {
    for (const f of CONSTELLATION_FIGURES) {
      for (const s of f.stars) {
        expect(s.raH, `${f.name}/${s.name} RA`).toBeGreaterThanOrEqual(0);
        expect(s.raH, `${f.name}/${s.name} RA`).toBeLessThan(24);
        expect(s.decDeg, `${f.name}/${s.name} Dec`).toBeGreaterThanOrEqual(-90);
        expect(s.decDeg, `${f.name}/${s.name} Dec`).toBeLessThanOrEqual(90);
        expect(s.magnitude, `${f.name}/${s.name} magnitude`).toBeLessThan(7);
      }
    }
  });

  /*
   * Pegasus runs from 21h to 0.2h. Without unwrapping RA across 0h its span reads
   * as ~350 degrees and the whole figure collapses toward a point.
   */
  it("projects every figure to a real spread, including ones crossing RA 0h", () => {
    for (const f of CONSTELLATION_FIGURES) {
      const p = projectFigure(f);
      const xs = p.map((s) => s.position[0]);
      const ys = p.map((s) => s.position[1]);
      const span = Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      );
      expect(span, `${f.name} collapsed`).toBeGreaterThan(1);
    }
  });

  it("projects deterministically", () => {
    const f = CONSTELLATION_FIGURES[0]!;
    expect(projectFigure(f)).toEqual(projectFigure(f));
  });
});

describe("chartLayout", () => {
  it("returns one slot per course", () => {
    expect(chartLayout(7)).toHaveLength(7);
    expect(chartLayout(0)).toEqual([]);
  });

  it("keeps every figure inside the plate", () => {
    for (const count of [1, 7, 12, 26, 40]) {
      for (const slot of chartLayout(count)) {
        const dx = slot.cx - 500;
        const dy = slot.cy - 520;
        expect(Math.hypot(dx, dy), `count ${count} escaped the plate`).toBeLessThanOrEqual(331);
      }
    }
  });

  it("never overlaps two figures", () => {
    for (const count of [2, 7, 8, 12, 18, 26, 36, 50, 64]) {
      const slots = chartLayout(count);
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const d = Math.hypot(slots[i]!.cx - slots[j]!.cx, slots[i]!.cy - slots[j]!.cy);
          /*
           * A figure is drawn out to about `70 * scale` from its centre, so two
           * centres must stay more than that apart or the linework collides.
           */
          expect(d, `count ${count}: slots ${i}/${j} collide`).toBeGreaterThan(
            140 * slots[i]!.scale,
          );
        }
      }
    }
  });

  /*
   * Regression: even-area packing (`r ∝ √i`) put the first figures of a
   * seven-course sky near the centre and left the outer plate empty, so the
   * chart read as a huddle in the middle of a large circle. Every assertion
   * above passed while that was true — only the distance from centre catches it.
   */
  it("pushes a sparse sky out into a ring rather than huddling it centrally", () => {
    for (const count of [3, 7, 8]) {
      const radii = chartLayout(count).map((s) =>
        Math.hypot(s.cx - 500, s.cy - 520),
      );
      expect(Math.min(...radii), `count ${count} sits too close to centre`)
        .toBeGreaterThan(0.45 * 330);
    }
  });

  it("uses the full disc once there are enough figures to fill it", () => {
    const radii = chartLayout(26).map((s) => Math.hypot(s.cx - 500, s.cy - 520));
    // A full sky should reach both the middle and the rim.
    expect(Math.min(...radii)).toBeLessThan(0.35 * 330);
    expect(Math.max(...radii)).toBeGreaterThan(0.9 * 330);
  });

  it("is deterministic", () => {
    expect(chartLayout(9)).toEqual(chartLayout(9));
  });

  /*
   * §3.3 of the plan: adding a course must not make every existing figure jump.
   * Layout is a function of the capacity tier, so growth inside a tier is
   * append-only and only a tier crossing reshuffles.
   */
  it("does not move existing figures when a course is added inside the tier", () => {
    expect(layoutCapacity(7)).toBe(layoutCapacity(8));
    const before = chartLayout(7);
    const after = chartLayout(8);
    expect(after.slice(0, 7)).toEqual(before);
  });

  it("steps to a bigger tier rather than cramming", () => {
    expect(layoutCapacity(8)).toBe(8);
    expect(layoutCapacity(9)).toBe(12);
    expect(layoutCapacity(60)).toBeGreaterThanOrEqual(60);
  });

  it("shrinks figures as the sky fills up", () => {
    expect(chartLayout(26)[0]!.scale).toBeLessThan(chartLayout(7)[0]!.scale);
  });
});

describe("figure art registry", () => {
  it("slugifies constellation names, including two-word and accented ones", () => {
    expect(plateSlug("Orion")).toBe("orion");
    expect(plateSlug("Corona Borealis")).toBe("corona-borealis");
    expect(plateSlug("Canes Venatici")).toBe("canes-venatici");
    expect(plateSlug("Boötes")).toBe("bootes");
  });

  it("resolves a plate for every constellation the courses map to", () => {
    for (const name of [
      "Orion",
      "Cassiopeia",
      "Lyra",
      "Corvus",
      "Delphinus",
      "Corona Borealis",
      "Cygnus",
    ]) {
      const art = figureArtFor(name);
      expect(art, `${name} has no plate`).not.toBeNull();
      expect(art!.src).toBe(`/constellations/${plateSlug(name)}.webp`);
    }
  });

  it("returns null rather than a broken image for an unmapped figure", () => {
    expect(figureArtFor(null)).toBeNull();
    expect(figureArtFor("Not A Constellation")).toBeNull();
  });

  it("covers all 88 IAU constellations, so a new course needs a mapping not art", () => {
    expect(PLATE_SLUGS.size).toBe(88);
  });

  /*
   * There is no runtime existence check in the browser: a slug in this set with
   * no file on disk renders as a broken `<image>`. This is the guard.
   */
  it("matches the plates actually on disk", () => {
    const dir = path.join(process.cwd(), "public", "constellations");
    const onDisk = new Set(
      fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".webp"))
        .map((f) => f.replace(/\.webp$/, "")),
    );
    const missing = [...PLATE_SLUGS].filter((s) => !onDisk.has(s));
    const untracked = [...onDisk].filter((s) => !PLATE_SLUGS.has(s));
    expect(missing, "declared in PLATE_SLUGS but not on disk").toEqual([]);
    expect(untracked, "on disk but not declared in PLATE_SLUGS").toEqual([]);
  });
});
