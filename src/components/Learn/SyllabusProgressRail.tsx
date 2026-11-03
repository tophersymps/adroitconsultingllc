/**
 * SyllabusProgressRail - the course progress panel beside the syllabus
 * timeline (unified syllabus).
 *
 * Desktop (lg+): a sticky left column - progress ring, the knowledge-check
 * checkpoints as jump buttons, and exam readiness.
 * Tablet / mobile: the same content collapses into a compact card above the
 * timeline, with the checkpoints as a horizontal scroller.
 *
 * Presentation only. Every number is passed in by SeriesSyllabus, which owns
 * the progress hooks, so the rail and the timeline can never disagree.
 * Jump targets are buttons (not links): the syllabus' link order stays
 * "lessons and checks only".
 */
"use client";

import type { CheckState } from "@/lib/lesson-checks";

export interface RailCheckpoint {
  n: number;
  lessons: [number, number];
  state: CheckState;
  /** Best score, present when passed. */
  score?: number;
  /** The learner's next lesson falls inside this check's range. */
  current: boolean;
}

interface SyllabusProgressRailProps {
  completed: number;
  total: number;
  checkpoints: RailCheckpoint[];
  /** Compact exam label from `examLabels(kind).short` (never hardcoded). */
  examLabel: string;
  /** Scroll the timeline to a node id. */
  onJump: (id: string) => void;
}

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--ink-faint)]">
      <span aria-hidden="true" className="w-[3px] h-3.5 rounded-sm bg-[var(--accent)]" />
      {children}
    </p>
  );
}

export default function SyllabusProgressRail({
  completed,
  total,
  checkpoints,
  examLabel,
  onJump,
}: SyllabusProgressRailProps) {
  const pct = total > 0 ? Math.round((Math.min(completed, total) / total) * 100) : 0;
  const passed = checkpoints.filter((c) => c.state === "passed").length;
  const readiness = checkpoints.length > 0 ? Math.round((passed / checkpoints.length) * 100) : 0;

  return (
    <aside
      aria-label="Course progress"
      data-testid="syllabus-progress-rail"
      className="self-start rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] p-4 lg:p-5 lg:sticky lg:top-24"
    >
      <SectionLabel>Your progress</SectionLabel>

      <div className="mt-3 flex items-center gap-4 lg:flex-col lg:gap-2">
        <div className="relative flex-shrink-0 w-16 h-16 lg:w-28 lg:h-28">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r={RING_R} fill="none" strokeWidth="10" className="stroke-[var(--border-default)]" />
            <circle
              cx="60"
              cy="60"
              r={RING_R}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - pct / 100)}
              className="stroke-[var(--accent-bg)] transition-[stroke-dashoffset] duration-500"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-bold text-[var(--ink-strong)] text-sm lg:text-2xl tracking-[-0.02em]">
            {pct}%
          </span>
        </div>
        <div className="min-w-0 lg:text-center">
          <p className="text-sm font-semibold text-[var(--ink-strong)]" data-testid="rail-lesson-count">
            {completed} of {total} lessons
          </p>
          <p className="text-xs text-[var(--ink-muted)]">marked complete</p>
        </div>
      </div>

      {checkpoints.length > 0 ? (
        <>
          <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
            <SectionLabel>Checkpoints</SectionLabel>
            <ol className="mt-2.5 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {checkpoints.map((c) => {
                const isPassed = c.state === "passed";
                return (
                  <li key={c.n} className="flex-shrink-0 lg:flex-shrink">
                    <button
                      type="button"
                      onClick={() => onJump(`check-node-${c.n}`)}
                      data-state={isPassed ? "passed" : c.current ? "current" : "available"}
                      className={`w-full min-h-[40px] flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors duration-150 cursor-pointer ${
                        c.current && !isPassed
                          ? "border-[var(--accent)] bg-[var(--accent)]/[0.07] text-[var(--ink-strong)] font-semibold"
                          : isPassed
                            ? "border-transparent text-[var(--ink-body)] hover:bg-[var(--surface-card-soft)]"
                            : "border-transparent text-[var(--ink-muted)] hover:bg-[var(--surface-card-soft)]"
                      }`}
                    >
                      <span className="whitespace-nowrap">
                        <span className="font-mono text-[11px] font-bold mr-1.5">K{c.n}</span>
                        Lessons {c.lessons[0]}&ndash;{c.lessons[1]}
                      </span>
                      {isPassed ? (
                        <span className="whitespace-nowrap font-mono text-[11px] font-bold text-[var(--signal-done)]">
                          &#10003; {c.score !== undefined ? `${Math.round(c.score)}%` : "Passed"}
                        </span>
                      ) : c.current ? (
                        <span className="whitespace-nowrap font-mono text-[10.5px] font-bold uppercase tracking-[0.05em] text-[var(--accent-on-tint)]">
                          You&apos;re here
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
            <SectionLabel>{examLabel}</SectionLabel>
            <div
              className="mt-3 h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden"
              role="progressbar"
              aria-label={`${examLabel} readiness`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={readiness}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${readiness}%`,
                  background: "linear-gradient(90deg, var(--color-navy-light), var(--accent-bg))",
                }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--ink-muted)]" data-testid="rail-exam-readiness">
              {passed} of {checkpoints.length} checks passed
            </p>
          </div>
        </>
      ) : null}
    </aside>
  );
}
