/**
 * src/lib/progress-complete.ts — server-authoritative completion writes.
 *
 * The single shared helper (`completeLessonServer`) for marking progress on the
 * server-graded tiers. Lesson completion was previously only written from
 * `POST /api/progress/lesson`; the knowledge-check and exam paths derive their
 * own completion from server-graded `quiz_attempt` rows and route the durable
 * write through here so course-complete logic lives in one place (ADR-211:
 * completion_events is the append-only log; lesson_completion is the current
 * per-lesson store).
 *
 * This module is SERVER-ONLY — it writes through the RLS cookie-bound client
 * (`getSupabaseServerClient`), never the service-role client, because these
 * rows belong to the signed-in owner.
 *
 * Paths:
 *  - lesson tier   → completeLessonServer({ userId, lessonSlugs:[slug] })
 *  - knowledge check (server 100%) → completeLessonServer({ userId, lessonSlugs:[covered…], series })
 *  - exam pass (>= 72) → completeLessonServer({ userId, series, viaExamPass: true })
 *
 * `viaExamPass` intentionally does NOT write lesson_completion rows — the
 * learner keeps uncompleted lessons individually open to revisit (Chris
 * decision 2026-09-07) while the course itself reads complete.
 */
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { appendCompletionEvent } from "@/lib/completion";
import { findSeriesForLessonSlug, getLessonsForSeries } from "@/lib/learn";
import { getKnowledgeChecks, scoreQuizAttemptsByQuiz } from "@/lib/quiz";

/** Result of a server completion write. */
export type CompleteLessonServerResult =
  | { ok: true }
  | { ok: false; error: { message: string } };

export interface CompleteLessonServerInput {
  userId: string;
  /**
   * Lessons to mark complete (upsert lesson_completion rows + log a 'lesson'
   * event each). Omit (or pass []) for the exam-pass path (`viaExamPass`).
   * All slugs must belong to the SAME series (resolved from the first).
   */
  lessonSlugs?: string[];
  /** Series slug. Optional — resolved from the first lesson slug when omitted. */
  series?: string;
  /**
   * Exam-pass course completion: mark the COURSE complete (append the 'course'
   * event) WITHOUT writing any lesson_completion row. Individual lessons stay
   * open to revisit.
   */
  viaExamPass?: boolean;
}

/**
 * Complete lesson(s) — and/or the course — server-side.
 *
 * Behavior mirrors the legacy lesson route's completion path exactly when
 * called with a single lesson (upsert the row, log the 'lesson' event, then
 * log the 'course' event when every published lesson in the series is now
 * complete), so the lesson route's contract is unchanged. Multi-lesson callers
 * (knowledge check: its covered range) get the same per-lesson rows/events and
 * a single course-complete evaluation across the series.
 *
 * The primary lesson_completion write returns an error (the route maps it to a
 * 500); every completion_events append is best-effort (idempotent) and never
 * fails the response.
 */
export async function completeLessonServer(
  input: CompleteLessonServerInput,
): Promise<CompleteLessonServerResult> {
  const { userId } = input;
  const lessonSlugs = input.lessonSlugs ?? [];
  const series = input.series ?? findSeriesForLessonSlug(lessonSlugs[0] ?? "");
  if (!series) return { ok: true }; // nothing to complete

  const supabase = await getSupabaseServerClient();

  // 1) Primary write: lesson_completion rows (skipped on the exam-pass path).
  if (!input.viaExamPass && lessonSlugs.length > 0) {
    const now = new Date().toISOString();
    const row = (slug: string) => ({ user_id: userId, lesson_slug: slug, completed_at: now });
    // Single-lesson callers (lesson route) keep the single-object shape.
    const payload = lessonSlugs.length === 1 ? row(lessonSlugs[0]!) : lessonSlugs.map(row);
    const { error } = await supabase
      .from("lesson_completion")
      .upsert(payload, { onConflict: "user_id,lesson_slug" });
    if (error) return { ok: false, error };
  }

  // 2) Best-effort completion events (never fail the response). Idempotent.
  try {
    const { data: courseRow } = await supabase
      .from("courses")
      .select("id")
      .eq("series_slug", series)
      .maybeSingle();
    const courseId = (courseRow as { id: string } | null)?.id ?? null;
    if (!courseId) return { ok: true };

    // 2a) 'lesson' events for the lessons just completed (not on exam pass).
    if (!input.viaExamPass) {
      const published = getLessonsForSeries(series);
      for (const slug of lessonSlugs) {
        const lesson = published.find((l) => l.slug === slug);
        await appendCompletionEvent({
          userId,
          courseId,
          eventType: "lesson",
          lesson: lesson?.lesson ?? null,
          lessonSlug: slug,
        });
      }
    }

    // 2b) Course complete. Exam pass completes the course outright; the lesson
    // path completes it when every published lesson in the series is now done.
    let courseComplete = Boolean(input.viaExamPass);
    if (!input.viaExamPass && lessonSlugs.length > 0) {
      const slugs = getLessonsForSeries(series).map((l) => l.slug);
      if (slugs.length > 0) {
        const { count } = await supabase
          .from("lesson_completion")
          .select("lesson_slug", { count: "exact", head: true })
          .eq("user_id", userId)
          .in("lesson_slug", slugs);
        if ((count ?? 0) >= slugs.length) courseComplete = true;
      }
    }
    if (courseComplete) {
      await appendCompletionEvent({ userId, courseId, eventType: "course" });
    }
  } catch (err) {
    console.error("[progress-complete] completion events", err);
  }

  return { ok: true };
}

/**
 * The published lesson slugs a knowledge check covers, from the check's
 * lesson-number range ([5n−4, 5n]) to the published LearnLesson slugs whose
 * `lesson` number falls inside it. Pure + deterministic (no DB) — a check
 * reaching a server-derived 100% completes exactly these lessons.
 */
export function checkCoveredLessonSlugs(series: string, checkN: number): string[] {
  const meta = getKnowledgeChecks(series).find((c) => c.n === checkN);
  if (!meta) return [];
  const [start, end] = meta.lessons;
  return getLessonsForSeries(series)
    .filter((l) => typeof l.lesson === "number" && l.lesson >= start && l.lesson <= end)
    .map((l) => l.slug);
}

/**
 * Knowledge-check auto-completion (server-authoritative). Called after a graded
 * check answer is upserted to quiz_attempt. Re-derives the WHOLE check's score
 * from the user's server-graded quiz_attempt rows for that quiz and, when the
 * set derives as a full-coverage 100% (scoreQuizAttemptRows refuses to score a
 * partial set), marks every lesson the check covers complete via the shared
 * helper.
 *
 * Full-coverage guard (AC-2): a partial or imperfect check never derives as
 * 100, so it can never complete a lesson. Only a genuinely perfect full set
 * triggers the completion. Best-effort — a DB read failure is logged, never
 * thrown (the grading reply already succeeded).
 */
export async function completeCheckLessonsOnPerfectScore(input: {
  userId: string;
  quizName: string;
  series: string;
  checkN: number;
  canonicalTotal: number;
}): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("quiz_attempt")
      .select("quiz_name, question_index, is_correct")
      .eq("user_id", input.userId)
      .eq("quiz_name", input.quizName);
    if (error) throw error;

    const canonicalTotals = new Map<string, number>([[input.quizName, input.canonicalTotal]]);
    const scores = scoreQuizAttemptsByQuiz(
      (data ?? []) as {
        quiz_name: string;
        question_index: number;
        is_correct: boolean;
      }[],
      canonicalTotals,
    );
    const derived = scores.get(input.quizName);
    // Full coverage + every answer correct → 100. Anything else (partial set,
    // any wrong answer) derives no score or a score < 100 → no completion.
    if (!derived || derived.score !== 100) return;

    const slugs = checkCoveredLessonSlugs(input.series, input.checkN);
    if (slugs.length === 0) return;
    await completeLessonServer({
      userId: input.userId,
      lessonSlugs: slugs,
      series: input.series,
    });
  } catch (err) {
    console.error("[progress-complete] completeCheckLessonsOnPerfectScore", err);
  }
}
