/**
 * POST /api/progress/quiz/run — record a completed quiz run.
 * GET  /api/progress/quiz/run?quizName=... — fetch best score + attempt count.
 *
 * Stats drive the "Quiz avg 82% · 3 attempts" strip on PathCard / series
 * header (design brief §5.3, US-005 AC5). LocalStorage is the client's
 * authoritative copy; this route backs cross-device display for authed
 * users. Guests get stats purely from localStorage (QuizStats component).
 *
 * Security (t_7469e31d F1): the POST body's client-reported `correct`/`total`
 * are IGNORED. correct/total/score are recomputed server-side from the
 * server-graded `quiz_attempt` rows (each answer was graded against the
 * canonical quiz JSON in POST /api/progress/quiz). A run is only recorded
 * when the graded attempt set covers the canonical question count, so a
 * forged POST can neither fabricate an 80%+ check score (exam unlock) nor a
 * 100% exam (certificate).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { resolveQuizByName, scoreQuizAttemptRows, parseQuizName } from "@/lib/quiz";
import { denyQuizNotAccessible } from "@/lib/access-gate";
import { getCourseRowBySlug } from "@/lib/access";
import { appendCompletionEvent } from "@/lib/completion";
import {
  checkOrigin,
  checkRateLimit,
  getClientIp,
  sanitiseDbError,
  validateQuizName,
} from "@/lib/api-security";

export async function POST(req: NextRequest) {
  try {
    /* --- Origin / CSRF check (F6) --- */
    const originErr = checkOrigin(req);
    if (originErr) {
      return NextResponse.json({ error: originErr }, { status: 403 });
    }

    /* --- Rate limit (F2) --- */
    if (!checkRateLimit(getClientIp(req))) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = (await req.json()) as {
      quizName?: unknown;
      // `correct` / `total` are accepted for backward compatibility with the
      // client hook but deliberately NOT read — they are client-writable and
      // forgeable (F1). Score comes from quiz_attempt rows below.
    };

    if (typeof body.quizName !== "string" || body.quizName.length === 0) {
      return NextResponse.json({ error: "quizName required" }, { status: 400 });
    }
    const quizErr = validateQuizName(body.quizName, "quizName");
    if (quizErr) {
      return NextResponse.json({ error: quizErr }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ status: "unauthenticated" });
    }

    // Entitlement gate (t_10214e52 / CWE-862): do not record a run (nor read
    // graded attempts) for a quiz in a course the user can't access.
    const gateErr = await denyQuizNotAccessible(user.id, body.quizName);
    if (gateErr) return gateErr;

    /* --- Derive score from server-graded quiz_attempt rows (F1) --- */
    const quiz = resolveQuizByName(body.quizName); // canonical question count
    const { data, error } = await supabase
      .from("quiz_attempt")
      .select("question_index, is_correct")
      .eq("user_id", user.id)
      .eq("quiz_name", body.quizName);

    if (error) {
      return NextResponse.json({ status: "error", error: sanitiseDbError(error) }, { status: 500 });
    }

    const attempts = scoreQuizAttemptRows(
      (data ?? []) as { question_index: number; is_correct: boolean }[],
    );

    // No graded attempts → nothing to record (unknown quiz names are
    // client-only, mirroring POST /api/progress/quiz).
    if (!attempts) {
      return NextResponse.json({ status: "ok" });
    }

    // F1: validate the derived total against the canonical question count.
    // If the graded attempt set does not cover the whole quiz (e.g. attempt
    // syncs still in flight, or a tampered quiz_name), do not record a
    // misleading run — the stats strip stays at the last complete run.
    if (quiz && attempts.total !== quiz.questions.length) {
      return NextResponse.json({ status: "ok" });
    }

    // Server-write-only (t_bb6ed113): quiz_run is RLS read-only for clients
    // (migration 006) — a direct anon-key + JWT insert is now denied. The
    // privileged service-role client records the run; correct/total/score
    // were derived above from the server-graded quiz_attempt rows (F1).
    const { error: runErr } = await getSupabaseServiceClient()
      .from("quiz_run")
      .insert({
        user_id: user.id,
        quiz_name: body.quizName,
        correct: attempts.correct,
        total: attempts.total,
        score: attempts.score,
        completed_at: new Date().toISOString(),
      });

    if (runErr) {
      return NextResponse.json({ status: "error", error: sanitiseDbError(runErr) }, { status: 500 });
    }

    // B-19 completion foundation: append to the immutable completion_events log.
    //   - a knowledge-check run (`<series>:check:N`) logs a 'quiz' event with the
    //     server-derived score envelope (F1 — score came from graded attempts).
    //   - a passed cert-prep exam (`<series>:exam`, score >= 72) logs an 'exam' event.
    //   - lesson-tier quizzes (`<series>:lesson:<slug>`) are handled by the lesson
    //     route (POST /api/progress/lesson appends a 'lesson' event) — skip here so
    //     we don't double-log. Best-effort: the primary quiz_run write already
    //     succeeded; a log failure must not fail the response (idempotent).
    await recordCompletionEvents(user.id, body.quizName, attempts);

    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const quizName = req.nextUrl.searchParams.get("quizName") ?? "";

    if (!quizName) {
      return NextResponse.json({ error: "quizName required" }, { status: 400 });
    }
    const quizErr = validateQuizName(quizName, "quizName");
    if (quizErr) {
      return NextResponse.json({ error: quizErr }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ bestScore: 0, attempts: 0 });
    }

    // Entitlement gate (t_10214e52 / CWE-862): don't reveal run stats for a
    // quiz in a course the user can't access.
    const gateErr = await denyQuizNotAccessible(user.id, quizName);
    if (gateErr) return gateErr;

    const { data, error } = await supabase
      .from("quiz_run")
      .select("score")
      .eq("user_id", user.id)
      .eq("quiz_name", quizName);

    if (error) {
      return NextResponse.json({ bestScore: 0, attempts: 0 });
    }

    const scores = (data ?? []) as { score: number }[];
    if (scores.length === 0) {
      return NextResponse.json({ bestScore: 0, attempts: 0 });
    }

    const bestScore = Math.max(...scores.map((s) => s.score));

    return NextResponse.json({ bestScore, attempts: scores.length });
  } catch {
    return NextResponse.json({ bestScore: 0, attempts: 0 });
  }
}

/**
 * B-19 completion foundation append (ADR-211). Logs the quiz/exam event for a
 * completed quiz run into the immutable completion_events log. Best-effort —
 * any failure is swallowed so it never breaks the primary quiz_run write.
 * Both appends are idempotent (appendCompletionEvent skips duplicates).
 *
 *  - `<series>:check:N`   → 'quiz' event, metadata { score, correct, total }.
 *  - `<series>:exam`      → 'exam' event when score >= 72 (passed), same envelope.
 *  - `<series>:lesson:*`  → skipped (the lesson route logs a 'lesson' event).
 */
async function recordCompletionEvents(
  userId: string,
  quizName: string,
  attempts: { score: number; correct: number; total: number },
): Promise<void> {
  try {
    const parsed = parseQuizName(quizName);
    if (!parsed || parsed.tier === "lesson") return;

    // Resolve the course id for the quiz's series so the event is course-scoped.
    const courseRow = await getCourseRowBySlug(parsed.series);
    const courseId = courseRow?.id ?? null;
    if (!courseId) return;

    if (parsed.tier === "exam") {
      // Exam event only on a pass (score >= 72); a fail is not a milestone.
      if (attempts.score >= 72) {
        await appendCompletionEvent({
          userId,
          courseId,
          eventType: "exam",
          metadata: {
            score: attempts.score,
            correct: attempts.correct,
            total: attempts.total,
          },
        });
      }
      return;
    }

    // Knowledge check (tier === "check") → quiz event.
    await appendCompletionEvent({
      userId,
      courseId,
      eventType: "quiz",
      lessonSlug: parsed.id,
      metadata: {
        score: attempts.score,
        correct: attempts.correct,
        total: attempts.total,
      },
    });
  } catch (err) {
    console.error("[completion] recordCompletionEvents (quiz/run)", err);
  }
}
