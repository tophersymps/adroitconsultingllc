/**
 * POST /api/progress/quiz — submit a quiz attempt.
 *
 * Per ADR-004: quiz data primarily stays client-side (localStorage via
 * useQuizProgress hook). For authenticated users, the attempt is also
 * persisted to the quiz_attempt Supabase table so progress survives
 * device changes and session resets.
 *
 * Security (t_3bbee885 F3): correctness is recomputed server-side from
 * the canonical `questions.json` — the client's `correctAnswerIndex` /
 * `isCorrect` are treated as hints, never trusted verbatim.
 *
 * Check-page key stripping (t_79a92b83 F2 / CWE-200): the knowledge-check
 * page ships `{question, options}` only (no answer key), so QuizWidget in
 * server-graded mode POSTs each answer here and grades feedback from the
 * RESPONSE, not from a client-side key. The response includes the correct
 * answer + explanation ONLY for the question just answered — the same
 * minimal-disclosure model as POST /api/progress/quiz/batch (t_c0c452f5).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { parseQuizName, resolveQuizByName } from "@/lib/quiz";
import { denyQuizNotAccessible } from "@/lib/access-gate";
import { completeCheckLessonsOnPerfectScore } from "@/lib/progress-complete";
import {
  checkOrigin,
  checkRateLimit,
  getClientIp,
  sanitiseDbError,
  validateIndex,
  validateQuizName,
} from "@/lib/api-security";

interface QuizPayload {
  quizName: string;
  questionIndex: number;
  userAnswerIndex: number;
  correctAnswerIndex: number;
  isCorrect: boolean;
}

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

    const body = (await req.json()) as QuizPayload | null;

    if (!body || !body.quizName) {
      return NextResponse.json({ status: "ok" });
    }

    const { quizName, questionIndex, userAnswerIndex } = body;

    /* --- Slug validation (F2) — tier quiz names carry colons (ADR-101) --- */
    const quizErr = validateQuizName(quizName, "quizName");
    if (quizErr) {
      return NextResponse.json({ error: quizErr }, { status: 400 });
    }

    /* --- Load canonical quiz and validate indexes (F3) --- */
    const quiz = resolveQuizByName(quizName);
    if (!quiz) {
      return NextResponse.json({ status: "ok" }); // unknown quiz → client-only
    }
    const questionCount = quiz.questions.length;

    const questionIdxErr = validateIndex(questionIndex, "questionIndex", questionCount);
    if (questionIdxErr) {
      return NextResponse.json({ error: questionIdxErr }, { status: 400 });
    }

    const userAnswerIdxErr = validateIndex(userAnswerIndex, "userAnswerIndex", quiz.questions[questionIndex]!.options.length);
    if (userAnswerIdxErr) {
      return NextResponse.json({ error: userAnswerIdxErr }, { status: 400 });
    }

    /* --- Recompute correctness server-side (F3) --- */
    const correctAnswerIndex = quiz.questions[questionIndex]!.correct_answer_index;
    const isCorrect = userAnswerIndex === correctAnswerIndex;

    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ status: "unauthenticated" });
    }

    // Entitlement gate (t_10214e52 / CWE-862): a signed-in user with no
    // access to the quiz's course must not receive the server-graded
    // correctAnswerIndex + explanation (answer-key reconstruction bypass).
    const gateErr = await denyQuizNotAccessible(user.id, quizName);
    if (gateErr) return gateErr;

    // Server-write-only (t_bb6ed113): quiz_attempt is RLS read-only for
    // clients (migration 006) — a direct anon-key + JWT write is now denied.
    // The privileged service-role client performs the write; correctness was
    // recomputed above from the canonical quiz JSON, never the client payload.
    const { error } = await getSupabaseServiceClient()
      .from("quiz_attempt")
      .upsert(
        {
          user_id: user.id,
          quiz_name: quizName,
          question_index: questionIndex,
          correct_answer_index: correctAnswerIndex,
          user_answer_index: userAnswerIndex,
          is_correct: isCorrect,
          attempted_at: new Date().toISOString(),
        },
        { onConflict: "user_id,quiz_name,question_index" },
      );

    if (error) {
      return NextResponse.json({ status: "error", error: sanitiseDbError(error) }, { status: 500 });
    }

    // Server-authoritative lesson auto-completion (knowledge-check tier):
    // after the graded attempt is persisted, re-derive the WHOLE check's score
    // from quiz_attempt rows. When the set derives as a full-coverage 100%,
    // every lesson the check covers is marked complete via the shared helper.
    // A partial/imperfect check never derives 100, so it never completes a
    // lesson. Best-effort: a completion failure must not fail the graded reply.
    const parsedName = parseQuizName(quizName);
    // A wrong answer can never make the check's set derive as 100%, so only
    // re-derive after a correct answer (saves a read per incorrect attempt).
    if (parsedName?.tier === "check" && isCorrect) {
      const checkN = Number(parsedName.id);
      if (Number.isInteger(checkN) && checkN > 0) {
        await completeCheckLessonsOnPerfectScore({
          userId: user.id,
          quizName,
          series: parsedName.series,
          checkN,
          canonicalTotal: quiz.questions.length,
        });
      }
    }

    // Return the server-graded result so server-graded clients (check page,
    // t_79a92b83) can render feedback without the key ever shipping in the
    // page payload. Disclosure is minimal: only the question just answered.
    return NextResponse.json({
      status: "ok",
      result: {
        isCorrect,
        correctAnswerIndex,
        ...(quiz.questions[questionIndex]!.explanation
          ? { explanation: quiz.questions[questionIndex]!.explanation }
          : {}),
      },
    });
  } catch {
    // Client keeps the authoritative copy in localStorage
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}