/**
 * ConstellationCelebration — the P1 milestone celebration on lesson completion.
 *
 * Upgraded to the Adroit Tron visual aesthetic: glowing Adroit Crimson ignition
 * flare, neon Icy Cyan border accents, live streak multiplier, and clear
 * next-step action.
 *
 * Trigger: the local lesson-completion flag flipping to true + a
 * PROGRESS_CHANGED_EVENT broadcast.
 * Auto-dismisses, on click, or on Escape. Rendered as a transient role="status"
 * region with full keyboard accessibility.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lessonKey } from "@/lib/progress";
import { StreakCounter } from "@/components/Constellations/StreakCounter";
import type { ConstellationCelebrationProps } from "@/shared/contracts-constellations";

const AUTO_DISMISS_MS = 4500;

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
  const pulseOnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrated = useRef(false);

  const show = useCallback(() => {
    if (celebrated.current) return;
    celebrated.current = true;
    setVisible(true);
    if (courseJustCompleted) {
      pulseOnRef.current = setTimeout(() => setPulse(true), 60);
      pulseOffRef.current = setTimeout(() => setPulse(false), 1200);
    }
    timerRef.current = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
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
      if (pulseOnRef.current) clearTimeout(pulseOnRef.current);
      if (pulseOffRef.current) clearTimeout(pulseOffRef.current);
      timerRef.current = null;
      pulseOnRef.current = null;
      pulseOffRef.current = null;
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

  const pct = totalStars > 0 ? Math.round((litStars / totalStars) * 100) : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#060F1F]/80 backdrop-blur-md p-4"
      data-testid="constellation-celebration"
      onClick={() => setVisible(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative mx-auto w-full max-w-md rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-[#09152B] via-[#0B1D3A] to-[#060F1F] p-6 text-center shadow-[0_0_50px_rgba(79,195,247,0.2)] overflow-hidden"
      >
        {/* Ambient Grid Background */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_right,#4FC3F708_1px,transparent_1px),linear-gradient(to_bottom,#4FC3F708_1px,transparent_1px)] bg-[size:24px_24px] opacity-60 pointer-events-none"
        />

        {/* Close Button */}
        <button
          type="button"
          aria-label="Close milestone notification"
          onClick={() => setVisible(false)}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition font-mono text-sm p-1 z-10"
        >
          ✕
        </button>

        {/* Ignition Node — Crimson Flare */}
        <div className="relative mx-auto my-3 flex h-20 w-20 items-center justify-center z-10">
          {!reduceMotion && (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-[#C8102E]/30 animate-ping"
            />
          )}
          <span
            aria-hidden="true"
            className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-[#C8102E] to-[#E8354A] text-white font-extrabold text-2xl shadow-[0_0_30px_#C8102E] ${
              reduceMotion ? "" : "cx-ignite"
            } ${pulse ? "cx-flare" : ""}`}
          >
            ★
          </span>
        </div>

        {/* Milestone Kicker */}
        <div className="relative z-10 mt-2">
          <span className="font-mono text-[10.5px] font-bold uppercase tracking-widest text-[#4FC3F7] px-2.5 py-0.5 rounded bg-[#4FC3F7]/10 border border-[#4FC3F7]/25">
            Node Mastered · {courseName}
          </span>
        </div>

        {/* Headline */}
        <h2
          className={`relative z-10 mt-3 text-xl md:text-2xl font-extrabold leading-tight tracking-tight text-white ${
            reduceMotion ? "" : "cx-ignite"
          }`}
        >
          {courseJustCompleted ? "Constellation complete." : `${lessonLabel} — lit.`}
        </h2>

        {/* Telemetry Stats Strip */}
        <div className="relative z-10 my-5 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-[#060F1F]/60 p-3">
          <div className="flex flex-col items-center justify-center border-r border-white/10 pr-2">
            <span className="font-mono text-[10px] uppercase font-bold text-slate-400">
              Mastery
            </span>
            <span className="font-mono text-sm font-bold text-white flex items-center gap-1.5 mt-0.5">
              <span className="text-[#C8102E]">★</span>
              <span>
                {litStars}/{totalStars}
              </span>
              <span className="text-xs text-slate-400 font-normal">({pct}%)</span>
            </span>
          </div>

          <div className="flex flex-col items-center justify-center pl-2">
            <span className="font-mono text-[10px] uppercase font-bold text-slate-400">
              Habit Momentum
            </span>
            {streakDays > 0 ? (
              <div className="mt-0.5">
                <StreakCounter streakDays={streakDays} />
              </div>
            ) : (
              <span className="font-mono text-xs text-slate-300 font-semibold mt-0.5">
                Active Session
              </span>
            )}
          </div>
        </div>

        {/* CTA Button */}
        <div className="relative z-10 space-y-2">
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#4FC3F7] to-[#0284C7] hover:from-[#38BDF8] hover:to-[#0369A1] text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-cyan-500/25 transition active:scale-95"
          >
            Continue Journey in {courseName} →
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConstellationCelebration;
