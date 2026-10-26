/**
 * lesson-checks.ts — the lesson ↔ knowledge-check mapping (A3).
 *
 * One pure module owns every relationship between a series' lessons and its
 * milestone knowledge checks, so the syllabus timeline, the lesson navigation
 * and the milestone panel can never disagree about where a check sits or
 * whether it is passed.
 *
 * Contract: `deliverables/learn-ux-exam-naming/api-contracts.md` §B.1
 * Decisions: ADR-303 (position derives from the check file's own range),
 *            ADR-304 / architecture.md §4 (there is NO lesson gating).
 *
 * Rules this module is built on:
 *
 *  - **Position comes from `check.lessons[1]`** — the range end that
 *    `getKnowledgeChecks()` (lib/quiz.ts) resolved from the check file's
 *    `"title": "Knowledge Check n: Lessons A–B"`. This module does no `5n`
 *    arithmetic of its own (ADR-303), so it stays correct for every per-course
 *    cadence and for short-tail merges.
 *  - **A check without a resolved range fails loudly.** A missing/short/backwards
 *    range means the title did not parse; recomputing `5n−4, 5n` here would
 *    silently misplace the milestone (quiz.ts:121's dormant fallback), which is
 *    exactly the failure ADR-303 exists to prevent. Every range read goes
 *    through {@link assertCheckRange}, which throws.
 *  - **No "locked" state.** `CheckState` is `"passed" | "available"` only; there
 *    is no mode parameter and no gate (architecture.md §4). The following lesson
 *    always renders, whether or not the preceding check is passed.
 *  - **Total.** `buildTimeline` returns exactly `lessons.length + checks.length`
 *    nodes for any input, including empty ones.
 *  - **Progress-independent.** No function here takes completion or pass state
 *    as a precondition for a node *existing*; `checkState` only labels a node
 *    that is already there.
 *
 * No `fs`, no React, no Node builtins: importable from a client component and
 * from a server component alike.
 */

import type { LearnLesson } from "@/data/types";
import { sortLessonsByLessonNumber } from "@/lib/lesson-sort";
import type { KnowledgeCheckMeta } from "@/shared/contracts";

/** Why a range is unusable — appended to the thrown message. */
const RANGE_RULE =
  'the range must come from getKnowledgeChecks(), which reads "Knowledge Check n: Lessons A–B" out of the check file title';

/**
 * Check presentation state. There is deliberately no `"locked"` member: lessons
 * are never gated (architecture.md §4, ADR-304).
 */
export type CheckState = "passed" | "available";

/** One node of the series syllabus timeline. */
export type TimelineNode =
  | { kind: "lesson"; lesson: LearnLesson }
  | { kind: "check"; check: KnowledgeCheckMeta };

/**
 * Throw when a check does not carry a usable `[a, b]` range (or a valid `n`).
 *
 * Deliberately loud: a check whose title stopped matching `Lessons A–B` must
 * break CI / the page rather than move a milestone somewhere plausible.
 */
function assertCheckRange(check: KnowledgeCheckMeta, context: string): void {
  const range: unknown = (check as { lessons?: unknown } | null | undefined)?.lessons;
  const n: unknown = check?.n;
  const isRange =
    Array.isArray(range) &&
    range.length === 2 &&
    range.every((v) => Number.isInteger(v)) &&
    (range[0] as number) >= 1 &&
    (range[1] as number) >= (range[0] as number);
  if (!Number.isInteger(n) || (n as number) < 1 || !isRange) {
    throw new Error(
      `lesson-checks: ${context} received an unresolved check range: ` +
        `n=${JSON.stringify(n)} lessons=${JSON.stringify(range)}. ` +
        `A knowledge check must carry [startLesson, endLesson]; ${RANGE_RULE}. ` +
        `Do not recompute 5n here (ADR-303).`,
    );
  }
}

/**
 * A lesson's frontmatter `lesson` number, or `undefined` when it has none.
 * `build-learn.js` maps a missing number to `0`; those lessons still render (the
 * syllabus sorts them last, ADR-105) but can never anchor a check's range.
 */
function numberedLesson(lesson: LearnLesson): number | undefined {
  const n = lesson?.lesson;
  return Number.isInteger(n) && (n as number) >= 1 ? (n as number) : undefined;
}

/**
 * The check whose range ENDS at this lesson (check 1 → lesson 5).
 * When several checks share an end lesson, the lowest `n` wins (deterministic).
 */
export function checkEndingAt(
  checks: readonly KnowledgeCheckMeta[],
  lessonNumber: number,
): KnowledgeCheckMeta | undefined {
  let found: KnowledgeCheckMeta | undefined;
  for (const check of checks) {
    assertCheckRange(check, "checkEndingAt");
    if (check.lessons[1] !== lessonNumber) continue;
    if (found === undefined || check.n < found.n) found = check;
  }
  return found;
}

/**
 * The check whose range COVERS this lesson (`a <= n <= b`).
 * Overlapping ranges resolve to the lowest `n` (the earliest milestone).
 */
export function checkCovering(
  checks: readonly KnowledgeCheckMeta[],
  lessonNumber: number,
): KnowledgeCheckMeta | undefined {
  let found: KnowledgeCheckMeta | undefined;
  for (const check of checks) {
    assertCheckRange(check, "checkCovering");
    if (lessonNumber < check.lessons[0] || lessonNumber > check.lessons[1]) continue;
    if (found === undefined || check.n < found.n) found = check;
  }
  return found;
}

/**
 * First lesson strictly after `lessonNumber` — the lesson a passed check
 * continues into, and the neighbour that "dominates" a check's range end.
 */
export function nextLessonAfter(
  lessons: readonly LearnLesson[],
  lessonNumber: number,
): LearnLesson | undefined {
  let best: LearnLesson | undefined;
  let bestNumber = Number.POSITIVE_INFINITY;
  for (const lesson of lessons) {
    const number = numberedLesson(lesson);
    if (number === undefined || number <= lessonNumber) continue;
    if (number < bestNumber) {
      best = lesson;
      bestNumber = number;
    }
  }
  return best;
}

/**
 * Interleave checks into lesson order.
 *
 * A check renders immediately AFTER the last PUBLISHED lesson of its range (the
 * highest published lesson number `<= check.lessons[1]`). That covers three
 * cases in one rule:
 *
 *  - normal case — the range end is published, so the node sits right after it;
 *  - range end unpublished (curriculum still being written) — the node sits
 *    after the last published lesson of its range and never claims a lesson that
 *    does not exist yet;
 *  - check entirely after the published tail, or entirely before lesson 1 — no
 *    published lesson qualifies, so the node lands at the end of the timeline in
 *    `n` order. Nothing crashes and nothing is dropped.
 *
 * Checks that share an anchor render in `n` order. Input order does not matter:
 * lessons are ordered by `lesson` number and checks by `n` (neither array is
 * mutated). Total: `lessons.length + checks.length` nodes, always.
 */
export function buildTimeline(
  lessons: readonly LearnLesson[],
  checks: readonly KnowledgeCheckMeta[],
): TimelineNode[] {
  /* Same lesson order the syllabus renders (ADR-105: number asc, 0 last, stable). */
  const orderedLessons = sortLessonsByLessonNumber([...lessons]);
  const orderedChecks = checks
    .map((check, index) => ({ check, index }))
    .sort((a, b) => a.check.n - b.check.n || a.index - b.index)
    .map((entry) => entry.check);

  /*
   * Anchor each check on the last published lesson at or below its range end.
   * Indexing by anchor INDEX (not number) keeps the node after the last lesson
   * row with that number, so a duplicated lesson number cannot strand a check
   * mid-run.
   */
  const anchored = new Map<number, KnowledgeCheckMeta[]>();
  const trailing: KnowledgeCheckMeta[] = [];

  for (const check of orderedChecks) {
    assertCheckRange(check, "buildTimeline");
    const rangeEnd = check.lessons[1];
    let anchorIndex: number | undefined;
    for (let i = 0; i < orderedLessons.length; i += 1) {
      const number = numberedLesson(orderedLessons[i]!);
      if (number !== undefined && number <= rangeEnd) anchorIndex = i;
    }
    if (anchorIndex === undefined) {
      trailing.push(check);
      continue;
    }
    const bucket = anchored.get(anchorIndex);
    if (bucket) bucket.push(check);
    else anchored.set(anchorIndex, [check]);
  }

  const nodes: TimelineNode[] = [];
  orderedLessons.forEach((lesson, index) => {
    nodes.push({ kind: "lesson", lesson });
    for (const check of anchored.get(index) ?? []) nodes.push({ kind: "check", check });
  });
  for (const check of trailing) nodes.push({ kind: "check", check });

  return nodes;
}

/**
 * `"passed"` when the learner's passed-check set contains this check's `n`,
 * otherwise `"available"`. Never `"locked"`, and there is deliberately no mode
 * parameter: there is no lesson gating (architecture.md §4).
 */
export function checkState(
  check: KnowledgeCheckMeta,
  passedCheckNumbers: ReadonlySet<number>,
): CheckState {
  assertCheckRange(check, "checkState");
  return passedCheckNumbers.has(check.n) ? "passed" : "available";
}

/**
 * D-5 hide rule for the syllabus filter.
 *
 * - a lesson node is hidden when its lesson number is in the hidden set;
 * - a check node is hidden only when it is **passed** AND every lesson in its
 *   range is hidden. An unpassed check is never hidden by this filter, and a
 *   passed check stays visible while any lesson of its range is still shown.
 *
 * Takes lesson NUMBERS rather than slugs (contract amendment, same PR): a check
 * node's range is expressed in lesson numbers, so a set of slugs cannot answer
 * "is every lesson in this range hidden" without the lessons themselves.
 */
export function hiddenByFilter(
  node: TimelineNode,
  hiddenLessonNumbers: ReadonlySet<number>,
  passedCheckNumbers: ReadonlySet<number>,
): boolean {
  if (node.kind === "lesson") {
    const number = numberedLesson(node.lesson);
    return number !== undefined && hiddenLessonNumbers.has(number);
  }
  assertCheckRange(node.check, "hiddenByFilter");
  if (!passedCheckNumbers.has(node.check.n)) return false;
  const [start, end] = node.check.lessons;
  for (let lessonNumber = start; lessonNumber <= end; lessonNumber += 1) {
    if (!hiddenLessonNumbers.has(lessonNumber)) return false;
  }
  return true;
}
