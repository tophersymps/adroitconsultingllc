/**
 * Certificate of completion — eligibility derivation (ADR-106).
 *
 * The certificate is derived on demand from existing rows — no certificates
 * table. Rule: all planned lessons completed (lesson_completion rows for the
 * series' canonical slug set) AND exam best score >= 72 (quiz_run MAX for
 * `<series>:exam`). Because the exam unlocks only after every knowledge check
 * passes >= 80, a passing exam score implies the checks were passed too.
 *
 * Pure helpers here are unit-tested; the page wires them to Supabase rows.
 */
import fs from "fs";
import path from "path";

import type { CertificateEligibility } from "@/shared/contracts";

/** Exam pass threshold — a real cert attempt at 72% or higher counts. */
export const CERT_EXAM_PASS_PCT = 72;

/** Knowledge-check pass threshold (course progression pattern). */
export const CERT_CHECK_PASS_PCT = 80;

/** Copy-deck course name for the flagship series (exact string, §7). */
const OMNI_COURSE_NAME = "OmniStudio Developer Certification Prep";

interface ExamRunLike {
  score: number;
  completedAt?: string | null;
}

interface CheckRunLike {
  quizName: string;
  score: number;
}

/**
 * True when every check quiz for the series has a best score >= 80.
 * Best score per quiz = MAX over runs; an empty check list counts as passed
 * (mirrors exam/page.tsx, where a series with no checks renders the exam
 * unlocked). This is the exam-unlock predicate shared by the server-side
 * exam submit gate (OWASP A01 / CWE-285) and the certificate rule.
 */
export function areAllChecksPassed(
  checkQuizNames: string[],
  checkRuns: CheckRunLike[],
): boolean {
  const bestByCheck = new Map<string, number>();
  for (const run of checkRuns) {
    bestByCheck.set(run.quizName, Math.max(bestByCheck.get(run.quizName) ?? 0, run.score));
  }
  return checkQuizNames.every(
    (name) => (bestByCheck.get(name) ?? 0) >= CERT_CHECK_PASS_PCT,
  );
}

export interface CertificateEligibilityInput {
  /** Distinct lesson slugs with a lesson_completion row for this user. */
  completedLessonSlugs: string[];
  /** Planned lesson count for the series (e.g. 46). */
  totalLessons: number;
  /** All exam quiz_run rows for the user (MAX is the best score). */
  examRuns: ExamRunLike[];
  /** All check quiz_run rows for the user. */
  checkRuns: CheckRunLike[];
  /** The series' check quizNames (e.g. omni-studio-cert:check:1..9). */
  checkQuizNames: string[];
}

/**
 * Derive certificate eligibility from completion + exam rows.
 * Best score per quiz = MAX over runs; check passed = best >= 80;
 * eligible = all lessons completed AND exam best >= 72 AND every check
 * passed (>= 80). Requiring the checks explicitly (not just trusting that
 * "exam unlocked implies checks passed") is defense-in-depth: even if an
 * exam run is recorded without the unlock gate, a certificate still cannot
 * be earned without completing all 9 knowledge checks (OWASP A01 / CWE-285).
 */
export function buildCertificateEligibility(
  input: CertificateEligibilityInput,
): CertificateEligibility {
  const { completedLessonSlugs, totalLessons, examRuns, checkRuns, checkQuizNames } = input;

  const lessonsCompleted = Math.min(new Set(completedLessonSlugs).size, totalLessons);

  const examBest = examRuns.reduce((max, r) => Math.max(max, r.score), 0);
  const examPassed = examBest >= CERT_EXAM_PASS_PCT;

  const bestByCheck = new Map<string, number>();
  for (const run of checkRuns) {
    bestByCheck.set(run.quizName, Math.max(bestByCheck.get(run.quizName) ?? 0, run.score));
  }
  // Count only checks belonging to this series, best >= 80 (80 flat passes).
  const checksPassed = Math.min(
    checkQuizNames.filter((name) => (bestByCheck.get(name) ?? 0) >= CERT_CHECK_PASS_PCT).length,
    checkQuizNames.length,
  );

  const eligible =
    lessonsCompleted >= totalLessons &&
    examPassed &&
    areAllChecksPassed(checkQuizNames, checkRuns);

  return {
    eligible,
    lessonsCompleted,
    lessonsTotal: totalLessons,
    examBest,
    examPassed,
    checksPassed,
    checksTotal: checkQuizNames.length,
  };
}

/**
 * The certificate's "Completed" date: the earliest exam run that passed
 * (>= 72) — the moment the course was completed. Null when none passed.
 */
export function certificateCompletionDate(examRuns: ExamRunLike[]): string | null {
  const passing = examRuns
    .filter((r) => r.score >= CERT_EXAM_PASS_PCT)
    .map((r) => r.completedAt ?? "")
    .filter((d) => d.length > 0)
    .sort();
  return passing[0] ?? null;
}

/** "2026-08-10T12:00:00Z" → "Aug 10, 2026" (passes unparseable input through). */
export function formatCertDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Recipient display name from the auth user: full_name / name / display_name
 * metadata, then email, then a generic label.
 */
export function certificateRecipientName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string {
  const meta = user.user_metadata ?? {};
  for (const key of ["full_name", "name", "display_name"]) {
    const v = meta[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  if (user.email) return user.email;
  return "Learner";
}

/**
 * Course name shown on the certificate. The copy deck §7 pins the exact
 * string for the flagship series; other series fall back to their name.
 */
export function certificateCourseName(series: string, fallbackName: string): string {
  if (series === "omni-studio-cert") return OMNI_COURSE_NAME;
  return fallbackName;
}

/**
 * The canonical planned-lesson slug set for a series, from the generator's
 * per-lesson question files (`content/learn/<series>/questions/<slug>.json`).
 * This is the slug set the "all 46 lessons" rule counts against — it includes
 * unpublished lessons whose MDX hasn't shipped yet but whose sidecar JSON
 * exists (generator contract: 46 files). Falls back to [] for non-tier series.
 */
export function getSeriesLessonSlugs(series: string): string[] {
  if (typeof series !== "string" || !/^[a-zA-Z0-9_-]+$/.test(series)) return [];
  const dir = path.join(process.cwd(), "content", "learn", series, "questions");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const slugs = files
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
  return [...new Set(slugs)].sort();
}
