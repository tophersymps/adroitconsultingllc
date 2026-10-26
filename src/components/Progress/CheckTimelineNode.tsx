/**
 * CheckTimelineNode — a knowledge check rendered as a milestone node inside the
 * series syllabus timeline (K1 design, api-contracts.md §B.5).
 *
 * A check is a milestone, never a door: there are exactly two states,
 * `available` and `passed` — no locked variant, no disabled row, no gating
 * (architecture.md §4). The node is rendered for EVERY check on first view,
 * independent of progress and of the tiers response: a learner with zero
 * completed lessons, and a guest, both see `Available` in the same first paint.
 *
 * Presentation lives in `globals.css` (`.milestone*`, ported from
 * `design/mockup-check-node.html`). The subtle part is the container query:
 * below a 560px syllabus container the badge drops under the label so a long
 * range can never squeeze it, and there is no fixed min-width anywhere.
 */
"use client";

import Link from "next/link";
import type { KnowledgeCheckMeta } from "@/shared/contracts";
import type { CheckState } from "@/lib/lesson-checks";

export interface CheckTimelineNodeProps {
  /** Series slug — the check page lives at `/atlas/<series>/check/<n>`. */
  series: string;
  /** `{ n, lessons: [a, b] }` from `getKnowledgeChecks()`. */
  check: KnowledgeCheckMeta;
  /** `"passed"` | `"available"` — the prop IS the state; no mode/gate param. */
  state: CheckState;
  /** Present only when passed; rendered as `Passed · {bestScore}%`. */
  bestScore?: number;
  /**
   * Id of the syllabus' single explanatory line (`unlockNote`). The note is
   * rendered ONCE per syllabus and referenced with `aria-describedby` so the
   * link name stays short (K1 spec §3.5) — never repeated per node.
   */
  noteId?: string;
  /**
   * Copy line from the label source. Only used when no shared `noteId` is
   * supplied (standalone rendering); it is exposed to assistive tech as a
   * visually hidden description, never as visible per-row chrome.
   */
  unlockNote?: string;
}

const AVAILABLE_ICON = (
  <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
    <circle cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.3" />
    <path
      d="M5 4.2 7.6 6 5 7.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PASSED_ICON = (
  <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
    <circle cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.3" />
    <path
      d="M3.8 6.2 5.2 7.6 8.2 4.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function CheckTimelineNode({
  series,
  check,
  state,
  bestScore,
  noteId,
  unlockNote,
}: CheckTimelineNodeProps) {
  const passed = state === "passed";
  const [startLesson, endLesson] = check.lessons;
  const score = passed && Number.isFinite(bestScore) ? Math.round(bestScore as number) : undefined;

  /* Accessible name covers number, range and state — never colour-only. */
  const accessibleName =
    passed && score !== undefined
      ? `Knowledge Check ${check.n}, lessons ${startLesson} to ${endLesson}, passed ${score} percent`
      : `Knowledge Check ${check.n}, lessons ${startLesson} to ${endLesson}, available`;

  /* Fallback description for standalone use (no shared syllabus note). */
  const localNoteId = noteId === undefined && unlockNote ? `check-unlock-note-${check.n}` : undefined;
  const describedBy = noteId ?? localNoteId;

  return (
    <div className="milestone" data-state={passed ? "passed" : "available"}>
      <Link
        href={`/atlas/${series}/check/${check.n}`}
        className="milestone__link"
        aria-label={accessibleName}
        aria-describedby={describedBy}
      >
        <span className="milestone__mark" aria-hidden="true">
          <span>K{check.n}</span>
        </span>
        <span className="milestone__label">
          Knowledge Check {check.n} · Lessons {startLesson}–{endLesson}
        </span>
        <span className="milestone__state">
          {passed ? PASSED_ICON : AVAILABLE_ICON}
          <span>{passed && score !== undefined ? `Passed · ${score}%` : "Available"}</span>
        </span>
      </Link>
      {localNoteId ? (
        <span id={localNoteId} className="sr-only">
          {unlockNote}
        </span>
      ) : null}
    </div>
  );
}
