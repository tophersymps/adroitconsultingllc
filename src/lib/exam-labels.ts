/**
 * src/lib/exam-labels.ts — the single source of exam naming for Atlas.
 *
 * Every exam surface (exam card, exam page, locked panel, guest CTA,
 * certificate, chronicle, SEO head) reads its wording from here as a function
 * of the series' `examKind`. Nothing else in the app may spell these strings
 * out; a literal "Certification Prep" outside this file is a bug (the B6 grep
 * test enforces that).
 *
 * Client-safe by construction: the only import is a TYPE (`ExamKind`), so this
 * module never drags the learn CONTENT dataset into a client bundle
 * (ADR-217/220/221 — see `client-data-imports.test.ts`). It holds copy and
 * nothing else: no series data, no per-slug table, no inference. The kind is
 * read from `series.json` at build time (B1) and passed in by the caller.
 *
 * Copy ownership: Lois. Wording lives in `api-contracts.md` §C and may not be
 * changed here without her sign-off (Kara owns typography only).
 */
import type { ExamKind } from "@/data/types";

/** The pass mark a knowledge check needs before the exam opens (copy only). */
const CHECK_PASS_COPY = "80%+";

export interface ExamLabelling {
  /** Long label for headings: "Course Completion Exam" | "Certification Prep Exam". */
  full: string;
  /** Compact label for kickers and pills: "Course Exam" | "Cert Prep Exam". */
  short: string;
  /** Lower-case in-sentence form: "course completion exam" | "cert prep exam". */
  phrase: string;
  /** Locked-panel heading. The count is a prop — never hardcode it. */
  lockHeading(checkCount: number): string;
  /** Browser tab title for the exam page (ADR-309: computed from labels, not exam.json). */
  seoTitle(seriesName: string): string;
  /** Page meta description for the exam page. */
  seoDescription(seriesName: string): string;
  /** Syllabus / check-node explanatory line; the pass mark is a prop. */
  unlockNote(checkPassPct: number): string;
}

/**
 * The copy table, verbatim from `api-contracts.md` §C. Keep both branches in
 * lockstep: adding a kind without copy is a type error (`Record<ExamKind, …>`).
 */
export const EXAM_LABELS: Record<ExamKind, ExamLabelling> = {
  "certification-prep": {
    full: "Certification Prep Exam",
    short: "Cert Prep Exam",
    phrase: "cert prep exam",
    lockHeading: (checkCount) =>
      `Unlock: complete all ${checkCount} knowledge checks with ${CHECK_PASS_COPY}`,
    seoTitle: (seriesName) => `${seriesName}: Certification Prep Exam | Adroit Learn`,
    seoDescription: (seriesName) => `Timed certification prep exam for ${seriesName}.`,
    unlockNote: (checkPassPct) =>
      `The timed cert prep exam opens once every knowledge check is passed at ${checkPassPct}% or higher.`,
  },
  "course-completion": {
    full: "Course Completion Exam",
    short: "Course Exam",
    phrase: "course completion exam",
    lockHeading: (checkCount) =>
      `Unlock: complete all ${checkCount} knowledge checks with ${CHECK_PASS_COPY}`,
    seoTitle: (seriesName) => `${seriesName}: Course Completion Exam | Adroit Learn`,
    seoDescription: (seriesName) => `Timed course completion exam for ${seriesName}.`,
    unlockNote: (checkPassPct) =>
      `The timed course completion exam opens once every knowledge check is passed at ${checkPassPct}% or higher.`,
  },
};

/**
 * Resolve the labelling for a series kind.
 *
 * Total over `ExamKind` and defensive at runtime: an unknown kind THROWS rather
 * than defaulting to certification prep. Silently labelling one of our own
 * courses as certification prep is the exact bug this release exists to fix
 * (US-009), so a bad value must be loud.
 */
export function examLabels(kind: ExamKind): ExamLabelling {
  if (!Object.hasOwn(EXAM_LABELS, kind)) {
    throw new Error(
      `examLabels: unknown ExamKind ${JSON.stringify(kind)} — expected one of ${Object.keys(EXAM_LABELS).join(", ")}`,
    );
  }
  return EXAM_LABELS[kind];
}
