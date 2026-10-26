"use client";

/**
 * MarkCompleteCompact — the completion control that rides in the lesson audio
 * bar (K2 layout, card A8 t_1975dec0).
 *
 * This is the compact, one-way sibling of the hero `MarkComplete` toggle: it
 * rides in the `trailing` slot of `AudioPlayer` / `AudioPlayerLazy` on the
 * lesson page only. Same hook, same write path (`useLessonProgress` →
 * `POST /api/progress/lesson`) — nothing new touches Supabase.
 *
 * | State      | Renders                                                    |
 * | ---------- | ---------------------------------------------------------- |
 * | incomplete | `<button class="mc-btn">` "Mark complete", 143 × 44        |
 * | complete   | `<span role="status" class="mc-chip">` "Completed", static  |
 *
 * The complete state is NOT a toggle: un-marking stays on the hero control.
 * The wrapper is the fixed 144 × 44 `.ab-complete` slot from the K2 spec, so
 * the button→chip swap never resizes the slot, the bar, or the `<audio>`
 * element. The swap is a DOM replacement with no transition of its own, so
 * reduced-motion readers see the identical behaviour (no animation to
 * suppress); the hover/press transitions the CSS does define are already
 * neutralised by the global reduced-motion rule.
 */
import { useEffect, useRef } from "react";
import { useLessonProgress } from "@/lib/hooks/useLessonProgress";

export interface MarkCompleteCompactProps {
  lessonSlug: string;
  /**
   * Human label folded into the control's accessible name so a screen-reader
   * user knows WHICH lesson this bar completes (A8 a11y acceptance). It
   * EXTENDS the visible label ("Mark complete") with context rather than
   * replacing it: the words on screen stay the first words announced.
   */
  label?: string;
}

export default function MarkCompleteCompact({ lessonSlug, label }: MarkCompleteCompactProps) {
  const { isCompleted, markComplete, isLoading } = useLessonProgress(lessonSlug);
  const chipRef = useRef<HTMLSpanElement>(null);
  // Set ONLY by the button's click handler: the sanctioned focus move is the
  // button→chip swap that removes the pressed element. The hook starts
  // `isCompleted=false` (hydration-safe) and flips true on mount for an
  // already-completed lesson — and again on same-tab/cross-tab sync from the
  // hero control — so an unguarded effect would steal focus and fire the
  // role="status" announcement on plain page load (QA t_81573261).
  const userSwappedRef = useRef(false);

  // Move focus to the chip when OUR swap removes the pressed button from the
  // DOM. tabindex="-1" keeps it out of the tab order.
  useEffect(() => {
    if (!isCompleted || !userSwappedRef.current) return;
    userSwappedRef.current = false;
    chipRef.current?.focus();
  }, [isCompleted]);

  const lessonName = label ?? lessonSlug;

  return (
    <div className="ab-complete">
      {isCompleted ? (
        <span ref={chipRef} className="mc-chip" role="status" tabIndex={-1}>
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Completed
          <span className="sr-only">{` for ${lessonName} — change this in the lesson header`}</span>
        </span>
      ) : (
        <button
          type="button"
          className="mc-btn"
          onClick={() => {
            // Mark the swap as user-initiated so the focus effect above may run.
            userSwappedRef.current = true;
            markComplete();
          }}
          disabled={isLoading}
          aria-disabled={isLoading}
          aria-label={`Mark complete for ${lessonName}`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <polyline points="8 12.2 11 15.2 16.2 9.4" />
          </svg>
          <span>Mark complete</span>
        </button>
      )}
    </div>
  );
}
