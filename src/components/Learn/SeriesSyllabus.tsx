/**
 * SeriesSyllabus — client wrapper for the series syllabus timeline (ADR-105, A5).
 *
 * The syllabus is one timeline: every published lesson AND every knowledge
 * check, interleaved by `buildTimeline` (A3) so a check sits between the last
 * lesson of its range and the next lesson. A check is a milestone, not a door —
 * it is always present, there is no locked state, and the following lesson
 * always renders.
 *
 * Unified syllabus (replaces the separate course roadmap above the list): the
 * timeline IS the course map. Each lesson card carries its brief and its
 * practice-question status, the rail beside it draws progress (completed
 * segments in brand red), and SyllabusProgressRail summarises the same numbers
 * (sticky left column on desktop, compact card above the list below lg).
 *
 * Responsibilities:
 *  - lesson-number sort via LessonSortToggle + `?sort=asc|desc`. Descending
 *    reverses the TIMELINE, so each check keeps its position relative to the
 *    lesson boundary it belongs to (after L6, before L5).
 *  - "Hide completed" filter via the D-5 rule (`hiddenByFilter`): lessons whose
 *    slug the learner completed are hidden; a check node is hidden only when it
 *    is passed AND every lesson in its range is hidden.
 *  - per-check pass state from the shared tier rollup (`useTierProgress`).
 *    ONLY the `Passed` badge waits for that response: node presence and the
 *    `Available` state are a pure function of lessons + checks, so a learner
 *    with zero completed lessons sees check 1 on first paint.
 *  - lesson state: `completed` (merged completion), `active` (the first
 *    not-completed lesson in lesson-number order, i.e. "up next"), otherwise
 *    `upcoming`.
 *
 * Hide-completed is hydration-gated (QA F-1 pattern): the filter state is
 * client-only and merges localStorage + Supabase completion via
 * useProgressSummary, so guests see the same list with nothing to hide.
 */
"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import LessonCard, { type LessonCardState, type LessonQuizMeta } from "@/components/Learn/LessonCard";
import MarkComplete from "@/components/Progress/MarkComplete";
import CheckTimelineNode from "@/components/Progress/CheckTimelineNode";
import LessonSortToggle from "@/components/Learn/LessonSortToggle";
import SyllabusProgressRail, { type RailCheckpoint } from "@/components/Learn/SyllabusProgressRail";
import { useProgressSummary } from "@/lib/hooks/useProgressSummary";
import { useTierProgress } from "@/lib/hooks/useTierProgress";
import { buildTimeline, hiddenByFilter } from "@/lib/lesson-checks";
import { examLabels } from "@/lib/exam-labels";
import { CERT_CHECK_PASS_PCT } from "@/lib/exam-config";
import type { LearnLesson, ExamKind } from "@/data/types";
import type { KnowledgeCheckMeta } from "@/shared/contracts";

interface SeriesSyllabusProps {
  /** Series slug — the check pages live at `/atlas/<series>/check/<n>`. */
  series: string;
  /** Server-rendered lessons (already lesson-number sorted). */
  lessons: LearnLesson[];
  /** Milestone checks for this series (`getKnowledgeChecks`); `[]` = none. */
  checks: KnowledgeCheckMeta[];
  /** The series' exam kind — drives the single explanatory line's wording. */
  kind: ExamKind;
  totalLessons: number;
  /** Published count (server-side). */
  published: number;
  /**
   * Lessons still owed (curriculumLessons - published), computed server-side.
   * These render as "coming soon" placeholder nodes that demote to real
   * lessons as the daily learning crons publish them.
   */
  upcoming: number;
  /**
   * In-lesson practice quiz per lesson slug (`getQuizForLesson`, read on the
   * server). Drives the "n/m questions answered" pill; a lesson without an
   * entry simply shows no pill.
   */
  lessonQuizzes?: Record<string, LessonQuizMeta>;
}

/** Id of the one explanatory line each syllabus renders (aria-describedby). */
const UNLOCK_NOTE_ID = "syllabus-unlock-note";

/** DOM id of a check's timeline item (rail jump target). */
const checkNodeId = (n: number) => `check-node-${n}`;

export default function SeriesSyllabus({
  series,
  lessons,
  checks,
  kind,
  totalLessons,
  published,
  upcoming,
  lessonQuizzes = {},
}: SeriesSyllabusProps) {
  const [hideCompleted, setHideCompleted] = useState(false);
  const { merge } = useProgressSummary(
    [],
    lessons.map((l) => l.slug),
  );

  // Shared tier rollup (A4): one GET /api/progress/quiz/tiers per series page.
  // `null` until it lands (and for guests) — that only affects the badge.
  const { tiers } = useTierProgress(series);

  // Read the ?sort=asc|desc URL param written by LessonSortToggle (ADR-105).
  const searchParams = useSearchParams();
  const sortOrder = searchParams.get("sort") === "desc" ? "desc" : "asc";

  /*
   * The timeline is a pure function of lessons + checks. Reversing the whole
   * node list (not just the lessons) keeps each check on its own lesson
   * boundary in `?sort=desc`: [L7, L6, K1, L5, …].
   */
  const timeline = useMemo(() => {
    const nodes = buildTimeline(lessons, checks);
    return sortOrder === "desc" ? [...nodes].reverse() : nodes;
  }, [lessons, checks, sortOrder]);

  /** Completed lessons as lesson NUMBERS — the unit a check's range uses. */
  const hiddenLessonNumbers = useMemo(() => {
    const numbers = new Set<number>();
    for (const lesson of lessons) {
      const n = lesson.lesson;
      if (Number.isInteger(n) && (n as number) >= 1 && merge.lessons.has(lesson.slug)) {
        numbers.add(n as number);
      }
    }
    return numbers;
  }, [lessons, merge.lessons]);

  const passedCheckNumbers = useMemo(
    () => new Set<number>((tiers?.checks ?? []).filter((c) => c.passed).map((c) => c.n)),
    [tiers],
  );

  const bestScores = useMemo(
    () => new Map<number, number>((tiers?.checks ?? []).map((c) => [c.n, c.bestScore])),
    [tiers],
  );

  /** "Up next": the first not-completed lesson in lesson-number order. */
  const activeLesson = useMemo(
    () =>
      [...lessons]
        .sort((a, b) => (a.lesson ?? 0) - (b.lesson ?? 0))
        .find((l) => !merge.lessons.has(l.slug)) ?? null,
    [lessons, merge.lessons],
  );

  const lessonState = useCallback(
    (lesson: LearnLesson): LessonCardState => {
      if (merge.lessons.has(lesson.slug)) return "completed";
      if (activeLesson?.slug === lesson.slug) return "active";
      return "upcoming";
    },
    [merge.lessons, activeLesson],
  );

  const completedCount = useMemo(
    () => lessons.filter((l) => merge.lessons.has(l.slug)).length,
    [lessons, merge.lessons],
  );

  const checkpoints: RailCheckpoint[] = useMemo(() => {
    const activeNumber = activeLesson?.lesson;
    return checks.map((c) => ({
      n: c.n,
      lessons: c.lessons,
      state: passedCheckNumbers.has(c.n) ? "passed" : "available",
      score: bestScores.get(c.n),
      current:
        typeof activeNumber === "number" &&
        activeNumber >= c.lessons[0] &&
        activeNumber <= c.lessons[1],
    }));
  }, [checks, passedCheckNumbers, bestScores, activeLesson]);

  const jumpTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "center" });
    el.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
  }, []);

  const displayed = useMemo(() => {
    if (!hideCompleted) return timeline;
    return timeline.filter(
      (node) => !hiddenByFilter(node, hiddenLessonNumbers, passedCheckNumbers),
    );
  }, [timeline, hideCompleted, hiddenLessonNumbers, passedCheckNumbers]);

  const unlockNote =
    checks.length > 0 ? examLabels(kind).unlockNote(CERT_CHECK_PASS_PCT) : null;

  return (
    <div className="grid gap-6 lg:gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[272px_minmax(0,1fr)]">
      <SyllabusProgressRail
        completed={completedCount}
        total={lessons.length}
        checkpoints={checkpoints}
        examLabel={examLabels(kind).short}
        onJump={jumpTo}
      />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1 mb-1.5">
          <h2 className="font-mono text-[13px] font-bold text-gray-500 dark:text-[var(--ink-muted)] uppercase tracking-[0.08em]">
            {hideCompleted ? "In Progress" : "All Lessons"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11.5px] text-gray-500 dark:text-[var(--ink-muted)] font-medium hidden min-[430px]:inline">
              {published} published · {upcoming} upcoming
            </span>
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <span className="font-mono text-[10.5px] font-semibold text-gray-500 dark:text-[var(--ink-muted)]">
                Hide completed
              </span>
              {/* a11y (finding 6): 44x44 hit target — the visual track stays
                  32x18 but the button is w-11 h-11 with the track centered. */}
              <button
                role="switch"
                aria-checked={hideCompleted}
                aria-label="Hide completed lessons"
                onClick={() => setHideCompleted((v) => !v)}
                className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-colors duration-200 cursor-pointer ${
                  hideCompleted
                    ? "bg-navy/[0.06] dark:bg-[var(--surface-sunken)]"
                    : "bg-transparent"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 ${
                    hideCompleted ? "bg-navy" : "bg-gray-300 dark:bg-[var(--border-default)]"
                  }`}
                >
                  <span
                    className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow dark:bg-[var(--ink-body)] transition-transform duration-200 ${
                      hideCompleted ? "translate-x-[14px]" : ""
                    }`}
                  />
                </span>
              </button>
            </label>
            <LessonSortToggle compact />
          </div>
        </div>

        <div className="mt-3 syllabus-timeline">
          {displayed.length > 0 ? (
            <ol className="tl" aria-label="Course timeline">
              {displayed.map((node) => {
                if (node.kind === "check") {
                  const passed = passedCheckNumbers.has(node.check.n);
                  return (
                    <li
                      key={`check-${node.check.n}`}
                      id={checkNodeId(node.check.n)}
                      className="tl-item"
                      data-node="check"
                      data-state={passed ? "passed" : "available"}
                    >
                      <span className="tl-node" aria-hidden="true" />
                      <CheckTimelineNode
                        series={series}
                        check={node.check}
                        state={passed ? "passed" : "available"}
                        bestScore={bestScores.get(node.check.n)}
                        noteId={unlockNote ? UNLOCK_NOTE_ID : undefined}
                      />
                    </li>
                  );
                }
                const lesson = node.lesson;
                const state = lessonState(lesson);
                return (
                  <li
                    key={`lesson-${lesson.slug}`}
                    id={`lesson-node-${lesson.slug}`}
                    className="tl-item"
                    data-node="lesson"
                    data-state={state}
                  >
                    <span className="tl-node" aria-hidden="true" />
                    <LessonCard
                      lesson={lesson}
                      totalLessons={totalLessons}
                      state={state}
                      quiz={lessonQuizzes[lesson.slug] ?? null}
                      actions={
                        <span className="flex items-center gap-2">
                          <span className="hidden min-[430px]:inline font-mono text-[10px] font-bold text-[var(--ink-muted)] uppercase tracking-[0.07em]">
                            {state === "completed" ? "Completed" : "Mark complete"}
                          </span>
                          <MarkComplete lessonSlug={lesson.slug} label={`lesson ${lesson.slug}`} />
                        </span>
                      }
                    />
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-[13px] text-gray-500 dark:text-[var(--ink-muted)] py-6 text-center font-mono">
              {hideCompleted ? "All lessons completed — nice work." : "No lessons yet."}
            </p>
          )}

          {/* Coming-soon placeholder nodes for planned-but-unwritten lessons.
              When the daily learning cron publishes lesson N, it slides out of
              this list and into the published rows above — no manual step. */}
          {upcoming > 0 ? (
            <div className="tl-planned mt-2" data-testid="coming-soon-lessons">
              <p className="px-1 pt-3 pb-1 font-mono text-[10px] font-bold text-gray-400 dark:text-[var(--ink-faint)] uppercase tracking-[0.08em]">
                Coming soon
              </p>
              {Array.from({ length: upcoming }, (_, i) => published + i + 1).map((n) => (
                <div
                  key={n}
                  aria-label={`Lesson ${n}, coming soon`}
                  className="flex items-center gap-[18px] px-3 py-[12px] mb-2 rounded-xl border border-dashed border-gray-300 dark:border-[var(--border-default)] opacity-70"
                >
                  <div className="flex-shrink-0 w-12 h-10 sm:w-14 rounded-lg border border-dashed border-gray-300 dark:border-[var(--border-default)] flex flex-col items-center justify-center font-mono">
                    <span className="text-[15px] font-bold leading-none text-gray-400 dark:text-[var(--ink-faint)]">
                      {n}
                    </span>
                    <span className="text-[7.5px] uppercase tracking-[0.06em] text-gray-400 dark:text-[var(--ink-faint)] mt-0.5">
                      Lesson
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-gray-400 dark:text-[var(--ink-faint)] leading-snug">
                      Coming soon
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-[10px] font-bold text-gray-400 dark:text-[var(--ink-faint)] uppercase tracking-[0.05em]">
                    Planned
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {/* The explanatory line lives once per syllabus, not per node; every
              check node points at it with aria-describedby. */}
          {unlockNote ? (
            <p id={UNLOCK_NOTE_ID} className="syllabus-note">
              {unlockNote}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
