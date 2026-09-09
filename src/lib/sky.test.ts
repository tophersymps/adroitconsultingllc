/**
 * src/lib/sky.test.ts — pure builders for Constellations + Chronicle (B-18).
 *
 * buildConstellation / buildChronicle / buildAchievementStats / buildProfileSky
 * are pure + deterministic (no Supabase), so these are plain unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildAchievementStats,
  buildChronicle,
  buildConstellation,
  buildProfileSky,
  chronicleDay,
  chronicleLabel,
} from "./sky";
import type { CompletionEventRow } from "@/shared/contracts-constellations";

const ev = (over: Partial<CompletionEventRow>): CompletionEventRow => ({
  id: 1,
  user_id: "u1",
  course_id: "c1",
  event_type: "lesson",
  lesson: 1,
  lesson_slug: "l1",
  completed_at: "2026-09-01T12:00:00.000Z",
  metadata: null,
  ...over,
});

describe("buildConstellation", () => {
  it("maps lesson slugs to stars in order, 1-based, lit = completed", () => {
    const c = buildConstellation({
      courseId: "c1",
      seriesSlug: "agentic-ai",
      name: "Agentic AI Foundations",
      gradient: "from-x to-y",
      lessonSlugs: ["l1", "l2", "l3"],
      lessonLabels: { l1: "Intro", l2: "Agents", l3: "Safety" },
      completedSlugs: new Set(["l1", "l3"]),
    });
    expect(c.totalStars).toBe(3);
    expect(c.litStars).toBe(2);
    expect(c.complete).toBe(false);
    expect(c.stars.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(c.stars[0]).toMatchObject({ lessonSlug: "l1", lit: true, label: "Intro" });
    expect(c.stars[1]).toMatchObject({ lessonSlug: "l2", lit: false });
  });

  it("is complete only when every star is lit (and non-empty)", () => {
    const all = buildConstellation({
      courseId: "c1",
      seriesSlug: "s",
      name: "n",
      gradient: "g",
      lessonSlugs: ["a", "b"],
      completedSlugs: new Set(["a", "b"]),
    });
    expect(all.complete).toBe(true);

    const none = buildConstellation({
      courseId: "c1",
      seriesSlug: "s",
      name: "n",
      gradient: "g",
      lessonSlugs: [],
      completedSlugs: new Set(),
    });
    // Empty field is NOT "complete" — a course with no planned lessons
    // renders nothing, never a false "all lit" state.
    expect(none.complete).toBe(false);
  });

  it("derives complete when the exam is passed, even with lessons outstanding (Chris 2026-09-07)", () => {
    const passed = buildConstellation({
      courseId: "c1",
      seriesSlug: "s",
      name: "n",
      gradient: "g",
      lessonSlugs: ["a", "b", "c"],
      completedSlugs: new Set(["a"]), // only one lesson done
      examPassed: true,
    });
    // Exam pass completes the COURSE → constellation reads complete.
    expect(passed.examPassed).toBe(true);
    expect(passed.complete).toBe(true);
    // Individual stars stay lesson-derived — the two uncompleted lessons
    // remain visibly open for the learner to revisit (AC-4).
    expect(passed.stars.map((st) => st.lit)).toEqual([true, false, false]);
  });

  it("does NOT derive complete from a false/unset examPassed", () => {
    const c = buildConstellation({
      courseId: "c1",
      seriesSlug: "s",
      name: "n",
      gradient: "g",
      lessonSlugs: ["a", "b"],
      completedSlugs: new Set(["a"]),
      examPassed: false,
    });
    expect(c.complete).toBe(false);
  });

  it("defaults curriculumLessons to the published star count", () => {
    const c = buildConstellation({
      courseId: "c1",
      seriesSlug: "s",
      name: "n",
      gradient: "g",
      lessonSlugs: ["a", "b", "c"],
      completedSlugs: new Set(),
    });
    expect(c.curriculumLessons).toBe(3);
    expect(c.curriculumLessons).toBe(c.totalStars);
  });

  it("keeps a declared curriculum above what is published", () => {
    const c = buildConstellation({
      courseId: "c1",
      seriesSlug: "s",
      name: "n",
      gradient: "g",
      lessonSlugs: ["a"],
      curriculumLessons: 40,
      completedSlugs: new Set(),
    });
    expect(c.totalStars).toBe(1);
    expect(c.curriculumLessons).toBe(40);
  });

  it("never shrinks a stale declaration below what already exists", () => {
    const c = buildConstellation({
      courseId: "c1",
      seriesSlug: "s",
      name: "n",
      gradient: "g",
      lessonSlugs: ["a", "b", "c"],
      curriculumLessons: 1,
      completedSlugs: new Set(),
    });
    expect(c.curriculumLessons).toBe(3);
  });

  it("falls back to the slug when no label is provided", () => {
    const c = buildConstellation({
      courseId: "c1",
      seriesSlug: "s",
      name: "n",
      gradient: "g",
      lessonSlugs: ["l1"],
      completedSlugs: new Set(),
    });
    expect(c.stars[0].label).toBe("l1");
  });
});

describe("chronicleLabel / chronicleDay", () => {
  it("labels each event type per the copy deck", () => {
    expect(chronicleLabel(ev({ event_type: "lesson" }), { courseName: "AI" })).toBe("AI");
    expect(chronicleLabel(ev({ event_type: "course" }), { courseName: "AI" })).toBe("AI completed");
    expect(chronicleLabel(ev({ event_type: "quiz" }), { courseName: "AI" })).toBe("AI · knowledge check");
    expect(chronicleLabel(ev({ event_type: "exam" }), { courseName: "AI" })).toBe("AI · cert prep exam passed");
    expect(chronicleLabel(ev({ event_type: "certificate" }), { courseName: "AI" })).toBe("AI · certificate earned");
  });

  it("prefers the lesson label for lesson rows", () => {
    const lbl = chronicleLabel(ev({ event_type: "lesson" }), {
      courseName: "AI",
      lessonLabel: "Intro to Agents",
    });
    expect(lbl).toBe("Intro to Agents");
  });

  it("stamps a day from an ISO timestamp", () => {
    expect(chronicleDay("2026-09-01T12:00:00.000Z")).toBe("2026-09-01");
  });
});

describe("buildChronicle", () => {
  it("sorts newest-first and resolves course names + scores", () => {
    const rows: CompletionEventRow[] = [
      ev({
        id: 2,
        event_type: "quiz",
        completed_at: "2026-08-30T10:00:00.000Z",
        metadata: { score: 8, correct: 8, total: 10 },
      }),
      ev({
        id: 1,
        event_type: "certificate",
        completed_at: "2026-09-01T10:00:00.000Z",
        metadata: { certifiedAt: "2026-09-01" },
      }),
    ];
    const entries = buildChronicle({
      events: rows,
      courseNameById: { c1: "Agentic AI Foundations" },
    });
    expect(entries.map((e) => e.id)).toEqual([1, 2]);
    expect(entries[0].label).toBe("Agentic AI Foundations · certificate earned");
    expect(entries[1].score).toBe(8);
    expect(entries[1].courseName).toBe("Agentic AI Foundations");
  });
});

describe("buildAchievementStats / buildProfileSky", () => {
  it("assembles stats from derived numbers", () => {
    const stats = buildAchievementStats({
      streakDays: 14,
      longestStreakDays: 21,
      rank: {
        id: "explorer",
        name: "Explorer",
        description: "20 lessons / 2 courses",
        index: 2,
        nextProgressPct: 55,
      },
      coursesCompleted: 2,
      tracksCompleted: 1,
    });
    expect(stats.streakDays).toBe(14);
    expect(stats.rank?.id).toBe("explorer");
  });

  it("builds a full ProfileSky (stats + constellations + chronicle, non-guest)", () => {
    const sky = buildProfileSky({
      constellations: [],
      events: [ev({})],
      courseNameById: { c1: "AI" },
      rank: {
        id: "starseed",
        name: "Starseed",
        description: "Every journey starts with a single star.",
        index: 0,
        nextProgressPct: 0,
      },
      streakDays: 1,
      longestStreakDays: 1,
      coursesCompleted: 0,
      tracksCompleted: 0,
    });
    expect(sky.isGuest).toBe(false);
    expect(sky.stats.streakDays).toBe(1);
    expect(sky.constellations).toEqual([]);
    expect(sky.chronicle.length).toBe(1);
  });
});
