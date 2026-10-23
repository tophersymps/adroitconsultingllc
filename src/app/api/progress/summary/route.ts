/**
 * GET /api/progress/summary — return all progress data for the authenticated user.
 *
 * Single endpoint to avoid multiple round-trips on page load (ADR-005).
 * Returns empty data if unauthenticated.
 *
 * PERF (t_22e18719): the payload also carries the caller's per-quiz aggregate
 * (`quizStats`). The signed-in `/atlas` hub renders a quiz strip per card; each
 * one used to fetch `GET /api/progress/quiz/run` on its own, so 9 cards meant 9
 * extra requests on top of the 9 identical summary reads. Shipping the aggregate
 * here keeps the whole hub to one progress read.
 *
 * Security (t_10214e52 / CWE-862): progress is scoped to the caller's own
 * rows, but course-scoped entries (completed lessons + lesson reads + quiz
 * stats) are filtered through the access seam so a user who no longer has
 * access to a gated course does not see their progress in it. Blog reads are
 * not part of any course and are always returned. Fail-closed: an
 * unresolvable/erroring course is treated as not accessible.
 */
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/db/server";
import { accessSeam } from "@/lib/access";
import { findSeriesForLessonSlug } from "@/lib/learn";
import { parseQuizName } from "@/lib/quiz";

interface QuizStats {
  bestScore: number;
  attempts: number;
}

interface ProgressSummary {
  readContent: {
    blog: string[];
    lesson: string[];
  };
  completedLessons: string[];
  /** quizName → best score + completed runs. Empty for guests. */
  quizStats: Record<string, QuizStats>;
}

function emptySummary(): ProgressSummary {
  return { readContent: { blog: [], lesson: [] }, completedLessons: [], quizStats: {} };
}

/**
 * This payload is per-user. Tell the browser (and any shared intermediary) not
 * to store it: the client fetch already uses `cache: "no-store"`, but a proxy
 * between us and the browser is not party to that (SEC-R2-F2, CWE-525).
 */
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

/**
 * Resolve which of `series` the user may currently see progress for.
 * Fail-closed: a DB/auth error leaves the series out of the set.
 */
async function resolveAccessibleSeries(
  userId: string,
  series: Iterable<string>,
): Promise<Set<string>> {
  const accessible = new Set<string>();
  for (const s of new Set(series)) {
    try {
      const decision = await accessSeam.decideCourseAccess(userId, s);
      if (decision.kind === "granted" || decision.kind === "admin-preview") {
        accessible.add(s);
      }
    } catch {
      // Fail closed — an error must not reveal gated-course progress.
    }
  }
  return accessible;
}

/**
 * Keep only `items` whose course series (via `toSeries`) the user can
 * currently access. Items that resolve to no series (non-course, e.g. blog)
 * are always kept.
 */
function filterAccessible<T>(
  items: T[],
  toSeries: (item: T) => string | undefined,
  accessible: Iterable<string>,
): T[] {
  const allowed = accessible instanceof Set ? accessible : new Set(accessible);
  return items.filter((item) => {
    const s = toSeries(item);
    return s === undefined || allowed.has(s);
  });
}

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(emptySummary(), { headers: NO_STORE_HEADERS });
    }

    const [readRes, lessonRes, quizRes] = await Promise.all([
      supabase
        .from("read_progress")
        .select("content_type, content_slug")
        .eq("user_id", user.id),
      supabase
        .from("lesson_completion")
        .select("lesson_slug")
        .eq("user_id", user.id),
      supabase
        .from("quiz_run")
        .select("quiz_name, score")
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

    // Quiz aggregates: quiz_run is one row per completed run, so best score is
    // the max and attempts the row count — computed here instead of one
    // per-series round trip from the browser (PERF t_22e18719).
    const quizRows = (quizRes.data ?? []) as { quiz_name: string; score: number }[];
    const rawQuizStats: Record<string, QuizStats> = {};
    const quizSeries = new Map<string, string>();
    for (const row of quizRows) {
      // Defensive: a malformed/missing column must not poison the payload.
      if (typeof row?.quiz_name !== "string" || typeof row?.score !== "number") continue;
      quizSeries.set(row.quiz_name, parseQuizName(row.quiz_name)?.series ?? row.quiz_name);
      const agg = rawQuizStats[row.quiz_name] ?? { bestScore: 0, attempts: 0 };
      agg.attempts += 1;
      if (row.score > agg.bestScore) agg.bestScore = row.score;
      rawQuizStats[row.quiz_name] = agg;
    }

    // Entitlement filter (t_10214e52): drop course-scoped progress for
    // courses the user can't currently access. One access decision per
    // distinct series, shared by every section below.
    const seriesToCheck = new Set<string>();
    for (const slug of lessonReadSlugs) {
      const s = findSeriesForLessonSlug(slug);
      if (s) seriesToCheck.add(s);
    }
    for (const row of completedRows) {
      const s = findSeriesForLessonSlug(row.lesson_slug);
      if (s) seriesToCheck.add(s);
    }
    for (const s of quizSeries.values()) seriesToCheck.add(s);
    const accessible = await resolveAccessibleSeries(user.id, seriesToCheck);

    const accessibleLessonReads = filterAccessible(
      lessonReadSlugs,
      (slug) => findSeriesForLessonSlug(slug),
      accessible,
    );
    const accessibleCompletions = filterAccessible(
      completedRows,
      (row) => findSeriesForLessonSlug(row.lesson_slug),
      accessible,
    );

    const quizStats: Record<string, QuizStats> = {};
    for (const [quizName, stats] of Object.entries(rawQuizStats)) {
      if (accessible.has(quizSeries.get(quizName) ?? quizName)) {
        quizStats[quizName] = stats;
      }
    }

    const summary: ProgressSummary = {
      readContent: {
        blog: blogReads,
        lesson: accessibleLessonReads.map((slug) => `lesson/${slug}`),
      },
      completedLessons: accessibleCompletions.map((row) => row.lesson_slug),
      quizStats,
    };

    return NextResponse.json(summary, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(emptySummary(), {
      status: 500,
      headers: NO_STORE_HEADERS,
    });
  }
}
