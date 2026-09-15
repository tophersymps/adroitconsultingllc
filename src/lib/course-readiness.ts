/**
 * src/lib/course-readiness.ts — launch-readiness gate for the admin platform
 * (v4, t_0ed19ad0).
 *
 * A course may only flip `pending → live` when it is NOT half-finished:
 * it must have a title, at least one published lesson, and an access model
 * set. This same pure function drives BOTH the server-side guard (PATCH
 * /api/admin/courses/[slug] rejects a launch that isn't ready) and the
 * LaunchDialog's readiness checklist, so the UI can never show a state the
 * server would reject.
 *
 * Content-derived (series.json + published lessons via lib/learn); DB rows
 * (course title + access_model) come from the caller.
 */
import { getQuizForLesson, getQuizForSeries } from "@/lib/quiz";
import { getSeriesBySlug, getLessonsForSeries } from "@/lib/learn";
import type { CourseRow } from "@/shared/contracts-course-catalog";

export interface LaunchLessonPreview {
  series: string;
  lesson: number;
  title: string;
  excerpt: string;
}

export interface CourseReadiness {
  /** Course row title is non-empty. */
  hasTitle: boolean;
  /** At least one published lesson exists in content for the series. */
  hasPublishedLesson: boolean;
  /** access_model is set (always true — DB default 'granted', non-null). */
  accessModelSet: boolean;
  /**
   * Advisory: every published lesson ships a quiz (series-level quiz counts
   * as "published"). NOT part of the hard gate — some courses legitimately
   * use a series-level quiz or no per-lesson quiz, so this never blocks a
   * launch; it surfaces as a warn row in the checklist.
   */
  allQuizzesPublished: boolean;
  /** True when the course may launch (title + published lesson + model). */
  ready: boolean;
  publishedLessonCount: number;
  firstLesson: LaunchLessonPreview | null;
}

/** Compute the readiness of a course row against its content series. */
export function computeCourseReadiness(course: CourseRow): CourseReadiness {
  const lessons = getLessonsForSeries(course.series_slug);
  const published = lessons.filter((l) => l.status !== "draft");
  const seriesQuiz = getQuizForSeries(course.series_slug);
  const first = published[0];
  const hasPublishedLesson = published.length > 0;
  const allQuizzesPublished =
    !hasPublishedLesson ||
    seriesQuiz !== null ||
    published.every((l) => getQuizForLesson(course.series_slug, l.slug) !== null);

  return {
    hasTitle: course.title.trim().length > 0,
    hasPublishedLesson,
    accessModelSet: Boolean(course.access_model),
    allQuizzesPublished,
    ready:
      course.title.trim().length > 0 && hasPublishedLesson && Boolean(course.access_model),
    publishedLessonCount: published.length,
    firstLesson: first
      ? {
          series: first.series,
          lesson: first.lesson,
          title: first.title,
          excerpt: first.excerpt,
        }
      : null,
  };
}

/** Human-readable reason when a course is not ready (for the server 400). */
export function notReadyReason(readiness: CourseReadiness): string | null {
  if (!readiness.hasTitle) return "Course has no title";
  if (!readiness.hasPublishedLesson) return "Course has no published lessons";
  if (!readiness.accessModelSet) return "Course has no access model";
  return null;
}

/** Guard: is the series actually a known content series? */
export function seriesExists(slug: string): boolean {
  return getSeriesBySlug(slug) !== undefined;
}
