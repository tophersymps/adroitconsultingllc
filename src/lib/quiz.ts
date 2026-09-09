/**
 * Quiz data access — loads per-tier quiz JSON for the learn series:
 *
 *   content/<series>/questions.json              legacy series quiz (getQuizForSeries)
 *   content/learn/<series>/questions/<slug>.json per-lesson quiz   (getQuizForLesson)
 *   content/learn/<series>/checks/check-<n>.json knowledge check   (getKnowledgeCheck)
 *   content/learn/<series>/exam.json             cert prep exam     (getCertExam)
 *
 * Mirrors the pattern used by lib/learn.ts for MDX content. All functions
 * reject invalid series/slug/n via the QUIZ_SERIES_RE guard (no dots/slashes
 * → no path traversal).
 */
import fs from "fs";
import path from "path";

import type {
  KnowledgeCheckMeta,
  ParsedQuizName,
  QuizData,
  QuizQuestion,
  QuizTier,
} from "@/shared/contracts";

export type { QuizData, QuizQuestion, KnowledgeCheckMeta, ParsedQuizName, QuizTier };

/**
 * Strict charset for values that flow into a filesystem path join.
 * Kebab/snake-case slugs only — no dots, slashes, or path separators
 * (blocks `../` traversal). Defense-in-depth: the API routes already
 * validate via `validateSlug`/`validateQuizName`, but page routes feed the
 * raw `series` URL param here, so the join itself must refuse anything unsafe.
 * (Security audit t_4ee14a75 F2.)
 */
const QUIZ_SERIES_RE = /^[a-zA-Z0-9_-]+$/;

/** Max accepted length for series/slug/id segments (matches api-security). */
const SEGMENT_MAX = 200;

function isValidSegment(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= SEGMENT_MAX &&
    QUIZ_SERIES_RE.test(value)
  );
}

/** Read + parse a quiz JSON file, or null when missing/invalid. */
function readQuizJson(quizPath: string): QuizData | null {
  try {
    const raw = fs.readFileSync(quizPath, "utf-8");
    const parsed = JSON.parse(raw) as QuizData;
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Root of a series' tier quiz files: content/learn/<series>/. */
function tierRoot(series: string): string {
  return path.join(process.cwd(), "content", "learn", series);
}

/** Read a series quiz from `content/<series>/questions.json`, or null. */
export function getQuizForSeries(series: string): QuizData | null {
  if (!isValidSegment(series)) {
    console.warn("[quiz] rejecting invalid series slug:", JSON.stringify(series));
    return null;
  }
  return readQuizJson(
    path.join(process.cwd(), "content", series, "questions.json"),
  );
}

/** All series slugs that currently ship a quiz. */
export function getQuizSeriesSlugs(): string[] {
  const root = path.join(process.cwd(), "content");
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, "questions.json")))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Tier lookups (ADR-101)                                             */
/* ------------------------------------------------------------------ */

/**
 * Per-lesson quiz from `content/learn/<series>/questions/<slug>.json`, or null.
 * Lesson quizName scheme: `<series>:lesson:<slug>`.
 */
export function getQuizForLesson(series: string, slug: string): QuizData | null {
  if (!isValidSegment(series) || !isValidSegment(slug)) return null;
  return readQuizJson(path.join(tierRoot(series), "questions", `${slug}.json`));
}

/**
 * Knowledge-check metadata for a series: scans `content/learn/<series>/checks/`
 * for `check-<n>.json` and returns `[{ n, lessons: [a, b] }]` sorted by n.
 * Check n covers lessons [5n−4, 5n]. Empty array when the dir is missing.
 */
export function getKnowledgeChecks(series: string): KnowledgeCheckMeta[] {
  if (!isValidSegment(series)) return [];
  const dir = path.join(tierRoot(series), "checks");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const checks: KnowledgeCheckMeta[] = [];
  for (const file of files) {
    const m = /^check-(\d+)\.json$/.exec(file);
    if (!m) continue;
    const n = parseInt(m[1]!, 10);
    if (!Number.isInteger(n) || n < 1) continue;
    checks.push({ n, lessons: [5 * n - 4, 5 * n] });
  }
  return checks.sort((a, b) => a.n - b.n);
}

/**
 * Knowledge check quiz from `content/learn/<series>/checks/check-<n>.json`,
 * or null. n validated to a positive integer (actual range checked by caller
 * against getKnowledgeChecks when needed).
 */
export function getKnowledgeCheck(series: string, n: number): QuizData | null {
  if (!isValidSegment(series) || !Number.isInteger(n) || n < 1) return null;
  return readQuizJson(path.join(tierRoot(series), "checks", `check-${n}.json`));
}

/**
 * Cert prep exam from `content/learn/<series>/exam.json`, or null.
 * Exam quizName scheme: `<series>:exam`.
 */
export function getCertExam(series: string): QuizData | null {
  if (!isValidSegment(series)) return null;
  return readQuizJson(path.join(tierRoot(series), "exam.json"));
}

/* ------------------------------------------------------------------ */
/*  Quiz-name resolver (ADR-101)                                       */
/* ------------------------------------------------------------------ */

/**
 * Parse a tier quiz name into its parts:
 *   `omni-studio-cert:lesson:day-01-f1` → { series, tier: "lesson", id: slug }
 *   `omni-studio-cert:check:3`          → { series, tier: "check", id: "3" }
 *   `omni-studio-cert:exam`             → { series, tier: "exam", id: "exam" }
 * Bare series names (legacy `omni-studio-cert`) return null — resolveQuizByName
 * falls back to getQuizForSeries for those.
 */
export function parseQuizName(quizName: string): ParsedQuizName | null {
  if (typeof quizName !== "string" || quizName.length === 0) return null;
  const parts = quizName.split(":");
  if (parts.length < 2) return null;
  const series = parts[0]!;
  const tier = parts[1] as QuizTier;
  if (!isValidSegment(series)) return null;
  if (tier === "exam" && parts.length === 2) {
    return { series, tier: "exam", id: "exam" };
  }
  if ((tier === "lesson" || tier === "check") && parts.length === 3) {
    const id = parts[2]!;
    if (!isValidSegment(id)) return null;
    return { series, tier, id };
  }
  return null;
}

/**
 * Resolve a quiz name to its canonical QuizData:
 *  - tier names (`<series>:lesson:<slug>` etc.) dispatch to the tier lookup
 *  - bare series names fall back to the legacy getQuizForSeries
 * Returns null when unknown/invalid.
 */
export function resolveQuizByName(quizName: string): QuizData | null {
  const parsed = parseQuizName(quizName);
  if (!parsed) {
    // Legacy series-scoped quiz name (e.g. "omni-studio-cert") — the grading
    // route previously passed the whole quizName to getQuizForSeries.
    return getQuizForSeries(quizName);
  }
  switch (parsed.tier) {
    case "lesson":
      return getQuizForLesson(parsed.series, parsed.id);
    case "check": {
      // Strict digits only — `check:3abc` must NOT silently parse to 3
      // (security t_7469e31d F4). parseQuizName allows alphanumerics in
      // the id segment, so the strict regex is the last gate before the
      // filesystem join inside getKnowledgeCheck.
      if (!/^[0-9]+$/.test(parsed.id)) return null;
      const n = parseInt(parsed.id, 10);
      return getKnowledgeCheck(parsed.series, n);
    }
    case "exam":
      return getCertExam(parsed.series);
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Server-graded attempt scoring (source of truth: quiz_attempt)      */
/* ------------------------------------------------------------------ */

/** A server-graded quiz_attempt row (only fields scoring needs). */
export interface QuizAttemptRow {
  quiz_name: string;
  question_index: number;
  is_correct: boolean;
}

export interface QuizAttemptScore {
  correct: number;
  total: number;
  score: number;
}

/**
 * Score a set of server-graded quiz_attempt rows for ONE quiz. quiz_attempt
 * stores the latest graded answer per question (upsert on
 * user_id,quiz_name,question_index), so the derived score reflects the
 * user's current answer set. Returns null when there are no rows.
 *
 * Security (t_7469e31d F1/F2 + t_55105899 F2 coverage): quiz_run stats, the
 * exam unlock gate, and certificate eligibility all derive from these
 * server-graded rows — never from client-reported `correct`/`total`. When a
 * canonical question count is known (`canonicalTotal`), a partial attempt
 * set (fewer graded questions than the quiz has) returns null: a client that
 * answers only the questions it knows must not be scored as 100% of an
 * inflated denominator. This mirrors run/route.ts:90's full-coverage guard
 * and applies it to every F2 consumer (tiers, exam unlock, certificate).
 */
export function scoreQuizAttemptRows(
  rows: Pick<QuizAttemptRow, "question_index" | "is_correct">[],
  canonicalTotal?: number,
): QuizAttemptScore | null {
  // Latest answer per question wins (defensive against stray duplicates).
  const byQuestion = new Map<number, boolean>();
  for (const row of rows) {
    if (
      typeof row?.question_index === "number" &&
      typeof row?.is_correct === "boolean"
    ) {
      byQuestion.set(row.question_index, row.is_correct);
    }
  }
  const total = byQuestion.size;
  if (total === 0) return null;
  // F2 coverage guard (t_55105899 / CWE-345): only a full-coverage attempt
  // set is a valid score for pass/unlock/eligibility. A partial set (e.g. 8
  // of 15 check questions, all correct) must NOT derive as 100%.
  if (canonicalTotal !== undefined && total !== canonicalTotal) {
    return null;
  }
  let correct = 0;
  for (const ok of byQuestion.values()) {
    if (ok) correct += 1;
  }
  return {
    correct,
    total: canonicalTotal ?? total,
    score: Math.round((correct / (canonicalTotal ?? total)) * 100),
  };
}

/**
 * Group server-graded attempt rows by quiz_name and score each quiz.
 * When `canonicalTotals` is provided (quizName → canonical question count),
 * quizzes missing from the map are never scored and partial attempt sets
 * return no score (see scoreQuizAttemptRows) — a caller can only derive
 * pass/unlock/eligibility for quizzes it can validate against canonical JSON.
 */
export function scoreQuizAttemptsByQuiz(
  rows: QuizAttemptRow[],
  canonicalTotals?: ReadonlyMap<string, number>,
): Map<string, QuizAttemptScore> {
  const byQuiz = new Map<string, QuizAttemptRow[]>();
  for (const row of rows) {
    const list = byQuiz.get(row.quiz_name);
    if (list) list.push(row);
    else byQuiz.set(row.quiz_name, [row]);
  }
  const scores = new Map<string, QuizAttemptScore>();
  for (const [quizName, quizRows] of byQuiz) {
    // Defensive: a quiz with no known canonical count cannot be validated —
    // it must never grant anything.
    if (canonicalTotals && !canonicalTotals.has(quizName)) continue;
    const s = scoreQuizAttemptRows(quizRows, canonicalTotals?.get(quizName));
    if (s) scores.set(quizName, s);
  }
  return scores;
}
