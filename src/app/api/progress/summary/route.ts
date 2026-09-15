/**
 * GET /api/progress/summary — return all progress data for the authenticated user.
 *
 * Single endpoint to avoid multiple round-trips on page load (ADR-005).
 * Returns empty data if unauthenticated.
 *
 * Security (t_10214e52 / CWE-862): progress is scoped to the caller's own
 * rows, but course-scoped entries (completed lessons + lesson reads) are
 * filtered through the access seam so a user who no longer has access to a
 * gated course does not see their progress in it. Blog reads are not part of
 * any course and are always returned. Fail-closed: an unresolvable/erroring
 * course is treated as not accessible.
 */
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { accessSeam } from "@/lib/access";
import { findSeriesForLessonSlug } from "@/lib/learn";

interface ProgressSummary {
  readContent: {
    blog: string[];
    lesson: string[];
  };
  completedLessons: string[];
}

function emptySummary(): ProgressSummary {
  return { readContent: { blog: [], lesson: [] }, completedLessons: [] };
}

/**
 * Keep only `items` whose course series (via `toSeries`) the user can
 * currently access. Items that resolve to no series (non-course, e.g. blog)
 * are always kept. Fail-closed on DB error → treated as not accessible.
 */
async function filterAccessible<T>(
  userId: string,
  items: T[],
  toSeries: (item: T) => string | undefined,
): Promise<T[]> {
  const seriesSet = new Set<string>();
  for (const item of items) {
    const s = toSeries(item);
    if (s) seriesSet.add(s);
  }

  const accessible = new Set<string>();
  for (const s of seriesSet) {
    try {
      const decision = await accessSeam.decideCourseAccess(userId, s);
      if (decision.kind === "granted" || decision.kind === "admin-preview") {
        accessible.add(s);
      }
    } catch {
      // Fail closed — an error must not reveal gated-course progress.
    }
  }

  return items.filter((item) => {
    const s = toSeries(item);
    return s === undefined || accessible.has(s);
  });
}

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(emptySummary());
    }

    const [readRes, lessonRes] = await Promise.all([
      supabase
        .from("read_progress")
        .select("content_type, content_slug")
        .eq("user_id", user.id),
      supabase
        .from("lesson_completion")
        .select("lesson_slug")
        .eq("user_id", user.id),
    ]);

    const readRows = (readRes.data ?? []) as {
      content_type: string;
      content_slug: string;
    }[];

    // Blog reads are not course-gated — always returned.
    const blogReads = readRows
      .filter((r) => r.content_type === "blog")
      .map((r) => r.content_slug);

    // Lesson reads are course-gated (content_slug is namespaced `lesson/<slug>`).
    const lessonReadSlugs = readRows
      .filter((r) => r.content_type === "lesson")
      .map((r) => r.content_slug.replace(/^lesson\//, ""));

    const completedRows = (lessonRes.data ?? []) as { lesson_slug: string }[];

    // Entitlement filter (t_10214e52): drop course-scoped progress for
    // courses the user can't currently access.
    const [accessibleLessonReads, accessibleCompletions] = await Promise.all([
      filterAccessible(user.id, lessonReadSlugs, (slug) =>
        findSeriesForLessonSlug(slug),
      ),
      filterAccessible(user.id, completedRows, (row) =>
        findSeriesForLessonSlug(row.lesson_slug),
      ),
    ]);

    const summary: ProgressSummary = {
      readContent: {
        blog: blogReads,
        lesson: accessibleLessonReads.map((slug) => `lesson/${slug}`),
      },
      completedLessons: accessibleCompletions.map((row) => row.lesson_slug),
    };

    return NextResponse.json(summary);
  } catch {
    return NextResponse.json(emptySummary(), { status: 500 });
  }
}
