/**
 * src/lib/cram-sheets.ts - the exam cram-sheet registry.
 *
 * A cram sheet is the "night before" surface for a certification course: every
 * official objective on one page, each with the deciding fact and the trap the
 * exam prices. It exists because a 61-lesson course is the right shape for
 * learning and the wrong shape for revision.
 *
 * Deliberately a small registry rather than a generated file: a sheet is
 * per-course editorial judgement (which rule is THE deciding fact), so it is
 * reviewed like copy, not built like `learn.ts`.
 *
 * Client-safe: types and a plain object lookup, no server API and no `fs`.
 */
import { sfAgentforceSpecialistCram } from "@/data/cram/sf-agentforce-specialist";

/** One exam objective, with the rules that decide it and its headline trap. */
export type CramObjective = {
  /** Exam-outline id, e.g. `pe-3`. Stable across the course and the sheet. */
  id: string;
  /** Must be one of the parent sheet's `domains[].domain` strings. */
  domain: string;
  /** The official exam-guide objective wording. */
  objective: string;
  /** The deciding facts taught for this objective, one per covering lesson. */
  rules: string[];
  /** The single misconception the exam prices for this objective. */
  trap: string;
};

/** A blueprint domain: its share of the exam and the questions it actually draws. */
export type CramDomain = {
  domain: string;
  /** Share of the exam outline, as a whole percent. Must total 100 across the sheet. */
  weightPct: number;
  /** Questions this domain contributes to the scored set. Must total the scored count. */
  examDraw: number;
};

export type CramSheet = {
  series: string;
  /** The credential's full name, as it appears on the exam guide. */
  title: string;
  examFacts: {
    scoredQuestions: number;
    /**
     * Unscored questions mixed in at random. The count is a ceiling the guide
     * expresses as "up to", never a fixed number, so copy must say "up to".
     */
    unscoredUpTo: number;
    /** The release the questions align to, e.g. `Spring '26`. */
    versionLabel: string;
  };
  domains: CramDomain[];
  objectives: CramObjective[];
};

/**
 * Keyed by series slug. Adding a course's sheet here is what makes
 * `/atlas/<series>/cram` exist; a series absent from this map 404s.
 */
const SHEETS: Record<string, CramSheet> = {
  [sfAgentforceSpecialistCram.series]: sfAgentforceSpecialistCram,
};

/** The sheet for a series, or null when that course has none. */
export function getCramSheet(series: string): CramSheet | null {
  return SHEETS[series] ?? null;
}

/** Every series that has a cram sheet, for `generateStaticParams` and tests. */
export function cramSheetSeries(): string[] {
  return Object.keys(SHEETS);
}
