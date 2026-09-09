/**
 * POST /api/progress/quiz/batch — batch exam grading (ADR-102).
 *
 * One request for the whole exam — never 60 sequential POSTs. The server:
 *   1. Origin + rate-limit checks (a batch submit is 1 request; 30/min ample).
 *   2. validateQuizName (colon tier names, ADR-101) + resolveQuizByName → must
 *      be the exam tier (reject lesson/check/bare series).
 *   3. Validates elapsedSeconds ∈ [0, 105*60 + 60] (60s grace, ADR-103) and
 *      every questionIndex/userAnswerIndex via validateIndex.
 *   4. Recomputes correctness server-side from the canonical exam.json
 *      (F3 — client isCorrect is never trusted).
 *   5. Upserts all attempt rows in one batch (`onConflict:
 *      user_id,quiz_name,question_index`).
 *   6. Inserts one quiz_run row for best-score tracking (MAX semantics).
 *   7. Returns score + per-question results for the review screen — correct
 *      answers never ship in the initial HTML.
 *
 * Double-submit guard: the client disables submit while in flight; the server
 * tolerates duplicate runs via MAX best-score semantics (attemptCount may
 * over-count on a rare double-fire — documented in the impl plan risks).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getKnowledgeChecks, parseQuizName, resolveQuizByName } from "@/lib/quiz";
import { areAllChecksPassed } from "@/lib/certificate";
import { denyQuizNotAccessible } from "@/lib/access-gate";
import { completeLessonServer } from "@/lib/progress-complete";
import {
  checkOrigin,
  checkRateLimit,
  getClientIp,
  sanitiseDbError,
  validateIndex,
  validateQuizName,
} from "@/lib/api-security";
import type {
  ExamAnswer,
  ExamResultItem,
  ExamSubmitRequest,
  ExamSubmitResult,
} from "@/shared/contracts";

const EXAM_MINUTES = 105;
const EXAM_SECONDS = EXAM_MINUTES * 60;
const GRACE_SECONDS = 60;
const EXAM_PASS_PCT = 72;

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

    const body = (await req.json()) as ExamSubmitRequest | null;
    if (!body || typeof body.quizName !== "string" || !Array.isArray(body.answers)) {
      return NextResponse.json({ error: "quizName and answers required" }, { status: 400 });
    }

    /* --- Quiz-name validation + exam-tier check (ADR-101/102) --- */
    const quizErr = validateQuizName(body.quizName, "quizName");
    if (quizErr) {
      return NextResponse.json({ error: quizErr }, { status: 400 });
    }
    const parsed = parseQuizName(body.quizName);
    if (!parsed || parsed.tier !== "exam") {
      return NextResponse.json(
        { error: "quizName must be an exam tier quiz" },
        { status: 400 },
      );
    }

    const quiz = resolveQuizByName(body.quizName);
    if (!quiz) {
      return NextResponse.json({ error: "Unknown exam" }, { status: 404 });
    }
    const questionCount = quiz.questions.length;
    if (questionCount === 0) {
      return NextResponse.json({ error: "Exam has no questions" }, { status: 404 });
    }

    /* --- Elapsed-time bound (ADR-103) --- */
    if (
      typeof body.elapsedSeconds !== "number" ||
      !Number.isInteger(body.elapsedSeconds) ||
      body.elapsedSeconds < 0 ||
      body.elapsedSeconds > EXAM_SECONDS + GRACE_SECONDS
    ) {
      return NextResponse.json(
        { error: "elapsedSeconds out of range" },
        { status: 400 },
      );
    }

    /* --- Validate every answer + recompute correctness (F3) --- */
    const seenIndexes = new Set<number>();
    const results: ExamResultItem[] = [];
    const submittedByIndex = new Map<number, ExamAnswer>();
    let correctCount = 0;

    for (const answer of body.answers as ExamAnswer[]) {
      if (
        !answer ||
        typeof answer.questionIndex !== "number" ||
        typeof answer.userAnswerIndex !== "number"
      ) {
        return NextResponse.json({ error: "Invalid answer item" }, { status: 400 });
      }
      if (seenIndexes.has(answer.questionIndex)) {
        return NextResponse.json(
          { error: "Duplicate questionIndex" },
          { status: 400 },
        );
      }
      seenIndexes.add(answer.questionIndex);

      const qIdxErr = validateIndex(answer.questionIndex, "questionIndex", questionCount);
      if (qIdxErr) {
        return NextResponse.json({ error: qIdxErr }, { status: 400 });
      }
      const question = quiz.questions[answer.questionIndex]!;
      const aIdxErr = validateIndex(
        answer.userAnswerIndex,
        "userAnswerIndex",
        question.options.length,
      );
      if (aIdxErr) {
        return NextResponse.json({ error: aIdxErr }, { status: 400 });
      }

      submittedByIndex.set(answer.questionIndex, answer);
    }

    // Partial answer sets are ACCOUNTED FOR (t_55105899 F2 coverage): a
    // client may submit fewer than `questionCount` answers (timed exam, or a
    // forged partial POST). Missing questions are written as unanswered
    // (user_answer_index: -1 sentinel, is_correct: false) so quiz_attempt
    // always covers the canonical question count. This mirrors the scoring
    // rule in run/route.ts:90 and the canonical-denominator score below —
    // a partial set can never derive as 40/40 = 100% in F2 consumers
    // (tiers / exam unlock / certificate).

    /* --- Auth --- */
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ status: "unauthenticated" }, { status: 401 });
    }

    // Entitlement gate (t_10214e52 / CWE-862): a user with no access to the
    // exam's course must not receive per-question correctAnswerIndex for any
    // submitted answer (answer-key reconstruction / paywall bypass).
    const gateErr = await denyQuizNotAccessible(user.id, body.quizName);
    if (gateErr) return gateErr;

    /* --- Exam-unlock re-verification (OWASP A01 / CWE-285) ---
     * The page gates the exam until every knowledge check best >= 80
     * (ADR-104/Decision 9), but a direct API caller could otherwise submit
     * the exam with zero check runs. Enforce the same rule server-side:
     * reject with 403 before any row is written. Mirrors exam/page.tsx's
     * best-score derivation; a series with no checks stays unlocked (same
     * semantics as the page's `checks.every(...)` over an empty list). */
    const checkMetas = getKnowledgeChecks(parsed.series);
    const checkQuizNames = checkMetas.map((c) => `${parsed.series}:check:${c.n}`);
    if (checkQuizNames.length > 0) {
      const { data: checkRows, error: checkErr } = await supabase
        .from("quiz_run")
        .select("quiz_name, score")
        .eq("user_id", user.id)
        .in("quiz_name", checkQuizNames);
      if (checkErr) {
        return NextResponse.json({ status: "error", error: sanitiseDbError(checkErr) }, { status: 500 });
      }
      const checkRuns = ((checkRows ?? []) as { quiz_name: string; score: number }[]).map(
        (r) => ({ quizName: r.quiz_name, score: r.score }),
      );
      if (!areAllChecksPassed(checkQuizNames, checkRuns)) {
        return NextResponse.json(
          {
            status: "unlock-required",
            error: "Exam is locked until every knowledge check is passed (≥80%).",
          },
          { status: 403 },
        );
      }
    }

    const now = new Date().toISOString();
    // Build rows for ALL canonical questions: submitted answers are graded
    // against the canonical key; missing questions are written as unanswered
    // (user_answer_index: -1 sentinel, is_correct: false) so quiz_attempt
    // always has full coverage. Scoring below divides by questionCount, so
    // an unanswered question is treated as incorrect (t_55105899).
    const attemptRows: {
      user_id: string;
      quiz_name: string;
      question_index: number;
      correct_answer_index: number;
      user_answer_index: number;
      is_correct: boolean;
      attempted_at: string;
    }[] = [];
    for (let qi = 0; qi < questionCount; qi += 1) {
      const question = quiz.questions[qi]!;
      const submitted = submittedByIndex.get(qi);
      const isCorrect =
        submitted !== undefined && submitted.userAnswerIndex === question.correct_answer_index;
      if (isCorrect) correctCount += 1;
      results.push({
        questionIndex: qi,
        isCorrect,
        // t_c0c452f5 (CWE-200): only leak the correct answer for questions the
        // user actually answered. An empty/partial answers POST must not
        // disclose the full exam key — the review screen only needs isCorrect.
        ...(submitted !== undefined
          ? { correctAnswerIndex: question.correct_answer_index }
          : {}),
      });
      attemptRows.push({
        user_id: user.id,
        quiz_name: body.quizName,
        question_index: qi,
        correct_answer_index: question.correct_answer_index,
        user_answer_index: submitted?.userAnswerIndex ?? -1,
        is_correct: isCorrect,
        attempted_at: now,
      });
    }

    /* --- Batch upsert attempts (one request, onConflict upsert) ---
     * Server-write-only (t_bb6ed113): quiz_attempt is RLS read-only for
     * clients (migration 006), so this graded write uses the privileged
     * service-role client. */
    if (attemptRows.length > 0) {
      const { error } = await getSupabaseServiceClient()
        .from("quiz_attempt")
        .upsert(attemptRows, { onConflict: "user_id,quiz_name,question_index" });
      if (error) {
        return NextResponse.json({ status: "error", error: sanitiseDbError(error) }, { status: 500 });
      }
    }

    /* --- Insert one quiz_run row (best-score MAX semantics) ---
     * quiz_run is also server-write-only; the service-role client writes it. */
    const score = Math.round((correctCount / questionCount) * 100);
    const { error: runErr } = await getSupabaseServiceClient()
      .from("quiz_run")
      .insert({
        user_id: user.id,
        quiz_name: body.quizName,
        correct: correctCount,
        total: questionCount,
        score,
        completed_at: now,
      });
    if (runErr) {
      return NextResponse.json({ status: "error", error: sanitiseDbError(runErr) }, { status: 500 });
    }

    const result: ExamSubmitResult = {
      score,
      correct: correctCount,
      total: questionCount,
      passed: score >= EXAM_PASS_PCT,
      results,
    };

    // Exam-pass course completion (server-authoritative). A passed exam
    // completes the COURSE and lights the constellation WITHOUT writing
    // lesson_completion rows — the learner keeps uncompleted lessons open to
    // revisit (Chris decision 2026-09-07). completeLessonServer's viaExamPass
    // path appends the durable 'course' event (idempotent) and writes no
    // lesson rows. The constellation crown itself derives from the graded
    // quiz_attempt rows this request just upserted (loadExamPassedBySeries),
    // so no separate lesson write is needed to light it. Best-effort: a log
    // failure must not fail the grading reply.
    if (score >= EXAM_PASS_PCT) {
      await completeLessonServer({
        userId: user.id,
        series: parsed.series,
        viaExamPass: true,
      }).catch((err) => {
        console.error("[exam] mark course complete", err);
      });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
