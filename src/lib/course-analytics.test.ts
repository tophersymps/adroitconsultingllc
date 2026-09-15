/**
 * course-analytics.test.ts — pure per-course analytics aggregation (v4,
 * t_0ed19ad0): enrollment, lessons completed, avg progress, signal, weekly
 * trend. No DB — feeds a synthetic CourseRow + completion/read rows.
 */
import { describe, it, expect } from "vitest";
import { computeCourseAnalytics } from "@/lib/course-analytics";
import type { CourseRow } from "@/shared/contracts-course-catalog";

const NOW = "2026-08-25T12:00:00.000Z";

function course(over: Partial<CourseRow> = {}): CourseRow {
  return {
    id: "c1",
    series_slug: "agentic-ai",
    title: "Agentic AI",
    status: "live",
    access_model: "granted",
    price_cents: null,
    launched_at: NOW,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

const agenticLessons = ["lesson-a", "lesson-b", "lesson-c"];

describe("computeCourseAnalytics", () => {
  it("computes enrollment + avg progress from completion rows", () => {
    const res = computeCourseAnalytics({
      courses: [course()],
      courseLessonSlugs: { "agentic-ai": agenticLessons },
      completions: [
        // user1 completed all 3, user2 completed 1
        { user_id: "u1", lesson_slug: "lesson-a", completed_at: NOW },
        { user_id: "u1", lesson_slug: "lesson-b", completed_at: NOW },
        { user_id: "u1", lesson_slug: "lesson-c", completed_at: NOW },
        { user_id: "u2", lesson_slug: "lesson-a", completed_at: NOW },
      ],
      reads: [],
      now: NOW,
    });
    const c = res.courses[0]!;
    expect(c.enrollmentCount).toBe(2);
    expect(c.lessonsCompleted).toBe(4);
    expect(c.totalLessons).toBe(3);
    // avg progress = ((3/3) + (1/3)) / 2 = 0.666 → 67
    expect(c.avgProgress).toBe(67);
    expect(c.signal).toBe("in-progress");
    expect(res.summary.totalEnrollments).toBe(2);
    expect(res.summary.avgCompletion).toBe(67);
    expect(res.summary.onTrackCount).toBe(0);
  });

  it("treats lesson read_progress as enrollment", () => {
    const res = computeCourseAnalytics({
      courses: [course()],
      courseLessonSlugs: { "agentic-ai": agenticLessons },
      completions: [],
      reads: [
        { user_id: "u9", content_type: "lesson", content_slug: "lesson/lesson-b", read_at: NOW },
      ],
      now: NOW,
    });
    expect(res.courses[0]!.enrollmentCount).toBe(1);
    expect(res.courses[0]!.avgProgress).toBe(0);
    expect(res.courses[0]!.signal).toBe("no-data");
  });

  it("marks on-track at ≥70% and ignores completions in unknown series", () => {
    const res = computeCourseAnalytics({
      courses: [course()],
      courseLessonSlugs: { "agentic-ai": agenticLessons },
      completions: [
        { user_id: "u1", lesson_slug: "lesson-a", completed_at: NOW },
        { user_id: "u1", lesson_slug: "lesson-b", completed_at: NOW },
        { user_id: "u1", lesson_slug: "lesson-c", completed_at: NOW },
        // foreign lesson — must be ignored
        { user_id: "u1", lesson_slug: "foreign-lesson", completed_at: NOW },
      ],
      reads: [],
      now: NOW,
    });
    const c = res.courses[0]!;
    expect(c.avgProgress).toBe(100);
    expect(c.signal).toBe("on-track");
    expect(res.summary.onTrackCount).toBe(1);
  });

  it("returns empty weekly trend when there are no learners", () => {
    const res = computeCourseAnalytics({
      courses: [course()],
      courseLessonSlugs: { "agentic-ai": agenticLessons },
      completions: [],
      reads: [],
      now: NOW,
    });
    expect(res.weekly).toHaveLength(8);
    expect(res.weekly.every((w) => w.avgProgress === 0)).toBe(true);
    expect(res.courses[0]!.enrollmentCount).toBe(0);
  });
});
