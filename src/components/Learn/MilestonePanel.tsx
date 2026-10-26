/**
 * MilestonePanel — the end-of-range panel on a lesson that finishes a
 * knowledge check's range (A6, Item 2).
 *
 * Copy/contract: `deliverables/learn-ux-exam-naming/api-contracts.md` §B.5 and
 * architecture.md §3.2 ("Routing into the check"). Placement is owned by the
 * lesson page: between the practice questions and the sources.
 *
 * Server-rendered and presentational — **no** client state, **no** fetch, so the
 * primary action exists on first paint without waiting for the client progress
 * hook (that is the whole point: a learner with zero progress must see
 * "Take Knowledge Check 1" immediately).
 *
 * There is deliberately no `mode`/`blocked`/`locked` prop and no gating: the
 * panel is always ADDITIVE. The lesson body above it renders whether or not the
 * check is passed, and so does the following lesson (architecture.md §4).
 */

import Link from "next/link";

import type { LearnLesson } from "@/data/types";
import type { KnowledgeCheckMeta } from "@/shared/contracts";

interface MilestonePanelProps {
  series: string;
  /** The check whose range ends at this lesson. */
  check: KnowledgeCheckMeta;
  /** The lesson after this one — the "continue" destination once passed. */
  nextLesson: LearnLesson | undefined;
  /** Authoritative `quiz_attempt` verdict for this check. */
  passed: boolean;
}

/** "lessons 1–5" / "lesson 7" (a one-lesson range reads as a single lesson). */
function rangeLabel([start, end]: readonly [number, number]): string {
  return start === end ? `lesson ${start}` : `lessons ${start}–${end}`;
}

export default function MilestonePanel({
  series,
  check,
  nextLesson,
  passed,
}: MilestonePanelProps) {
  const [start, end] = check.lessons;
  const range = rangeLabel([start, end]);
  const checkHref = `/atlas/${series}/check/${check.n}`;

  /* Passed and there is a following lesson → continue the sequence.
   * Not passed (or nothing after this lesson) → the check is the destination. */
  const primary =
    passed && nextLesson
      ? {
          href: `/atlas/${series}/${nextLesson.slug}`,
          label: `Continue to Lesson ${nextLesson.lesson}`,
        }
      : passed
        ? { href: checkHref, label: `Review Knowledge Check ${check.n}` }
        : { href: checkHref, label: `Take Knowledge Check ${check.n}` };

  return (
    <section
      aria-label={`Knowledge Check ${check.n} milestone`}
      data-milestone={`check-${check.n}`}
      data-milestone-passed={passed ? "true" : "false"}
      className="mt-11 border-t border-gray-200 pt-7 dark:border-[var(--border-default)]"
    >
      <div className="max-w-[640px]">
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-red uppercase tracking-[0.08em] mb-1.5">
          <span className="w-[3px] h-3 rounded-sm bg-red" />
          Milestone
        </div>
        <div className="font-mono text-[10.5px] text-gray-500 tracking-[0.04em] mb-2">
          Lessons {start}
          {start === end ? "" : `–${end}`}
        </div>
        <h2 className="text-[1.35rem] font-extrabold text-navy tracking-[-0.02em] mb-1.5">
          You&rsquo;ve finished {range}
        </h2>
        <p className="text-[13px] text-gray-500 mb-2">
          {passed
            ? `Knowledge Check ${check.n} is passed. Keep going — the next lesson picks up where these left off.`
            : `Knowledge Check ${check.n} covers ${range}. Pass it to show the material has landed — you can keep reading either way.`}
        </p>
      </div>

      <Link
        href={primary.href}
        className="mt-3 inline-flex w-full sm:w-auto items-center justify-center gap-1.5 min-h-[44px] px-5 rounded-xl bg-navy text-white text-[13.5px] font-bold no-underline hover:bg-navy-light active:scale-[0.98] transition-all duration-150"
      >
        {primary.label}
        <span aria-hidden="true">&rarr;</span>
      </Link>
    </section>
  );
}
