/**
 * check-scores.ts — authoritative per-check pass state (A6).
 *
 * Extracted verbatim from `/atlas/[series]/exam/page.tsx` (the exam gate, see
 * security t_7469e31d F2 / t_55105899) so the exam gate **and** the lesson page
 * ask the same question of the same source. There must be exactly one answer to
 * "has this learner passed check N?":
 *
 *  - rows come from `quiz_attempt` — the server-graded history table. `quiz_run`
 *    is client-writable and must never decide anything (CWE-345);
 *  - each quiz is scored against the canonical question count from the check's
 *    own JSON (`getKnowledgeCheck(...).questions.length`), so a partial attempt
 *    set (8 of 15 answered, all correct) scores nothing rather than 100 %;
 *  - pass is `bestScore >= CERT_CHECK_PASS_PCT` (80).
 *
 * Contract: `deliverables/learn-ux-exam-naming/api-contracts.md` §B.3.
 * Consumers: `exam/page.tsx` (behaviour unchanged), `[slug]/page.tsx` (routing
 * into the check + the milestone panel, architecture.md §3.2 "Routing into the
 * check").
 *
 * A read failure is **not** an error here: an unreadable attempt set is scored
 * as "not passed", which is the non-destructive direction — the learner is
 * offered the check, which they can always take. Throwing would replace a whole
 * lesson page with a 500 because a progress badge could not be read.
 */

import type { DbClient } from "@/lib/db/server";
import { CERT_CHECK_PASS_PCT } from "@/lib/exam-config";
import { getKnowledgeCheck, scoreQuizAttemptsByQuiz } from "@/lib/quiz";
import type { KnowledgeCheckMeta } from "@/shared/contracts";

/** Per-check authoritative state (best score + pass verdict). */
export interface CheckScore {
  /** Best full-coverage score in percent; `0` when nothing scored. */
  bestScore: number;
  /** `bestScore >= CERT_CHECK_PASS_PCT`. */
  passed: boolean;
}

/** The `quiz_attempt.quiz_name` a knowledge check grades into. */
export function checkQuizName(series: string, checkNumber: number): string {
  return `${series}:check:${checkNumber}`;
}

const NOT_PASSED: CheckScore = { bestScore: 0, passed: false };

interface QuizAttemptRow {
  quiz_name: string;
  question_index: number;
  is_correct: boolean;
}

/**
 * One query for however many checks the caller needs. `quiz_name` is the
 * canonical `${series}:check:<n>` name, so a check of another series can never
 * leak into this series' verdict.
 */
async function readAttempts(
  supabase: DbClient,
  userId: string,
  quizNames: readonly string[],
): Promise<QuizAttemptRow[]> {
  const { data } = await supabase
    .from("quiz_attempt")
    .select("quiz_name, question_index, is_correct")
    .eq("user_id", userId)
    .in("quiz_name", quizNames);
  return (data ?? []) as QuizAttemptRow[];
}

/** Score one check against its canonical question count. */
function scoreOne(
  series: string,
  checkNumber: number,
  rows: readonly QuizAttemptRow[],
): CheckScore {
  const quiz = getKnowledgeCheck(series, checkNumber);
  // No check document → nothing can be validated → not passed. Same outcome as
  // the pre-extraction exam page (its canonical-totals map simply omitted it).
  if (!quiz) return NOT_PASSED;
  const name = checkQuizName(series, checkNumber);
  const scores = scoreQuizAttemptsByQuiz([...rows], new Map([[name, quiz.questions.length]]));
  const bestScore = scores.get(name)?.score ?? 0;
  return { bestScore, passed: bestScore >= CERT_CHECK_PASS_PCT };
}

/**
 * Pass state for every check of a series, keyed by check number.
 *
 * Identical derivation to the exam gate it was extracted from: one query, every
 * check scored, `passed` at 80 %, missing/partial attempts score `0`.
 */
export async function loadCheckScores(
  supabase: DbClient,
  userId: string,
  series: string,
  checks: readonly KnowledgeCheckMeta[],
): Promise<Map<number, CheckScore>> {
  const result = new Map<number, CheckScore>();
  if (checks.length === 0) return result;
  const rows = await readAttempts(
    supabase,
    userId,
    checks.map((check) => checkQuizName(series, check.n)),
  );
  for (const check of checks) result.set(check.n, scoreOne(series, check.n, rows));
  return result;
}

/**
 * Single-check convenience for the lesson page: one query filtered to the one
 * covering check, one verdict. Used for both the milestone panel and the Next
 * override so the page pays for a single progress read (US-008).
 */
export async function loadCheckScore(
  supabase: DbClient,
  userId: string,
  series: string,
  checkNumber: number,
): Promise<CheckScore> {
  const rows = await readAttempts(supabase, userId, [checkQuizName(series, checkNumber)]);
  return scoreOne(series, checkNumber, rows);
}
