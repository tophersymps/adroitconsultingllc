/**
 * ConstellationCelebration — the P1 "star ignition" moment on lesson
 * completion. A brief full-bleed overlay: icy-blue→red bloom star pop with the
 * `check-pop` spring, the course's progress, and a live streak chip. When this
 * lesson completes the course, the constellation pulses ≤1.2s and the label
 * reads "Constellation complete."
 *
 * Trigger: the local lesson-completion flag flipping to true + a
 * PROGRESS_CHANGED_EVENT broadcast (the same seam every progress hook uses).
 * Auto-dismisses (~3s), on click, or on Escape. Rendered as a transient
 * `role="status"` / `aria-live="polite"` region (not a modal dialog) because
 * it is auto-dismissing and non-interactive — no focus trap/restore needed.
 * Reduced motion flattens to a static confirmation. Guests are skipped (no
 * persistent completion).
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lessonKey } from "@/lib/progress";
import { StreakCounter } from "@/components/Constellations/StreakCounter";
import type { ConstellationCelebrationProps } from "@/shared/contracts-constellations";

const AUTO_DISMISS_MS = 3200;

export function ConstellationCelebration({
  courseName,
  lessonSlug,
  lessonLabel,
  litStars,
  totalStars,
  streakDays,
  courseJustCompleted,
  prefersReducedMotion,
}: ConstellationCelebrationProps) {
  const [visible, setVisible] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [reduceMotion] = useState(
    () =>
      prefersReducedMotion ??
      (typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches),
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrated = useRef(false);

  const show = useCallback(() => {
    if (celebrated.current) return;
    celebrated.current = true;
    setVisible(true);
    if (courseJustCompleted) {
      // Constellation pulse on course-complete (≤1.2s).
      const p = setTimeout(() => setPulse(true), 60);
      const clearPulse = setTimeout(() => setPulse(false), 1200);
      timerRef.current = setTimeout(() => {
        setVisible(false);
      }, AUTO_DISMISS_MS);
      return () => {
        clearTimeout(p);
        clearTimeout(clearPulse);
      };
    }
    timerRef.current = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [courseJustCompleted]);

  useEffect(() => {
    const key = lessonKey(lessonSlug);
    const onChanged = () => {
      let completed = false;
      try {
        completed = window.localStorage.getItem(key) === "true";
      } catch {
        completed = false;
      }
      if (completed) show();
    };
    window.addEventListener("adroit-blog:progress-changed", onChanged);
    window.addEventListener("storage", onChanged);
    return () => {
      window.removeEventListener("adroit-blog:progress-changed", onChanged);
      window.removeEventListener("storage", onChanged);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [lessonSlug, show]);

  // Escape dismisses the celebration while it is visible.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVisible(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(6,15,31,0.72)] backdrop-blur-[2px]"
      data-testid="constellation-celebration"
      onClick={() => setVisible(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-4 flex max-w-[380px] flex-col items-center gap-4 rounded-[20px] border border-white/10 bg-[#0B1D3A]/90 px-8 py-9 text-center shadow-2xl"
        style={{ background: "var(--sky-bg)" }}
      >
        <div className="relative flex h-16 w-16 items-center justify-center">
          <span
            aria-hidden
            className={`h-14 w-14 rounded-full ${reduceMotion ? "" : "cx-ignite"} ${
              pulse ? "cx-flare" : ""
            }`}
            style={{
              background: "var(--constellation-star-lit)",
              boxShadow: "0 0 0 6px var(--constellation-halo), 0 0 24px var(--constellation-halo)",
            }}
          />
        </div>

        <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--sky-ink-muted)]">
          Constellation · {courseName}
        </p>
        <h2
          className={`text-[1.35rem] font-extrabold leading-tight tracking-[-0.02em] text-[var(--sky-ink)] ${
            reduceMotion ? "" : "cx-ignite"
          }`}
        >
          {courseJustCompleted ? "Constellation complete." : `${lessonLabel} — lit.`}
        </h2>

        <div className="flex items-center gap-2 font-mono text-[12px] text-[var(--sky-ink-muted)]">
          <span className="text-[var(--constellation-star-lit)]">★</span>
          {litStars}/{totalStars} {totalStars === 1 ? "star" : "stars"} in this course
        </div>

        {streakDays > 0 && (
          <div className="rounded-full bg-white/5 px-3 py-1.5">
            <StreakCounter streakDays={streakDays} />
          </div>
        )}

        <p className="font-mono text-[11px] text-[var(--sky-ink-muted)]">
          Continue to {courseName}
        </p>
      </div>
    </div>
  );
}

export default ConstellationCelebration;
