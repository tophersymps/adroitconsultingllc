/**
 * course-readiness.test.ts — launch-readiness gate (v4, t_0ed19ad0).
 * computeCourseReadiness drives the server-side launch guard + the
 * LaunchDialog checklist. Mocked content seam for determinism.
 */
import { describe, it, expect, vi } from "vitest";
import type { CourseRow } from "@/shared/contracts-course-catalog";

const mocks = vi.hoisted(() => ({
  getLessonsForSeries: vi.fn(),
  getQuizForSeries: vi.fn(),
  getQuizForLesson: vi.fn(),
}));

vi.mock("@/lib/learn", () => ({
  getLessonsForSeries: mocks.getLessonsForSeries,
  getSeriesBySlug: () => ({ slug: "test" }),
}));
vi.mock("@/lib/quiz", () => ({
  getQuizForSeries: mocks.getQuizForSeries,
  getQuizForLesson: mocks.getQuizForLesson,
}));

import {
  computeCourseReadiness,
  notReadyReason,
} from "@/lib/course-readiness";

const NOW = "2026-08-25T12:00:00.000Z";
function course(over: Partial<CourseRow> = {}): CourseRow {
  return {
    id: "c1",
    series_slug: "test-series",
    title: "Test Course",
    status: "pending",
    access_model: "granted",
    price_cents: null,
    launched_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

function lesson(slug: string, status: "published" | "draft" = "published") {
  return {
    slug,
    title: "Lesson",
    series: "test-series",
    lesson: 1,
    excerpt: "…",
    date: NOW,
    author: "Adroit",
    readTime: "5 min",
    tags: [],
    status,
  };
}

describe("computeCourseReadiness", () => {
  it("is NOT ready without a title", () => {
    mocks.getLessonsForSeries.mockReturnValue([lesson("l1")]);
    const r = computeCourseReadiness(course({ title: "  " }));
    expect(r.hasTitle).toBe(false);
    expect(r.ready).toBe(false);
    expect(notReadyReason(r)).toBe("Course has no title");
  });

  it("is NOT ready with no published lessons", () => {
    mocks.getLessonsForSeries.mockReturnValue([lesson("l1", "draft")]);
    const r = computeCourseReadiness(course());
    expect(r.hasPublishedLesson).toBe(false);
    expect(r.ready).toBe(false);
    expect(notReadyReason(r)).toBe("Course has no published lessons");
  });

  it("is ready with a title, a published lesson, and an access model", () => {
    mocks.getLessonsForSeries.mockReturnValue([lesson("l1"), lesson("l2")]);
    mocks.getQuizForSeries.mockReturnValue(null);
    mocks.getQuizForLesson.mockReturnValue(null);
    const r = computeCourseReadiness(course());
    expect(r.hasTitle).toBe(true);
    expect(r.hasPublishedLesson).toBe(true);
    expect(r.accessModelSet).toBe(true);
    expect(r.ready).toBe(true);
    expect(r.publishedLessonCount).toBe(2);
    expect(r.firstLesson?.lesson).toBe(1);
    expect(notReadyReason(r)).toBeNull();
  });

  it("treats a series-level quiz as quizzes published", () => {
    mocks.getLessonsForSeries.mockReturnValue([lesson("l1")]);
    mocks.getQuizForSeries.mockReturnValue({ questions: [] } as never);
    const r = computeCourseReadiness(course());
    expect(r.allQuizzesPublished).toBe(true);
  });
});
