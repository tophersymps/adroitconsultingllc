/**
 * StreakCounter — the "DAY {N} · ★ streak" chip (P1). Renders a mono,
 * rose-tinted streak count. `inline` (chip) vs `stat` (stat-card) treatment.
 */
"use client";

import type { StreakCounterProps } from "@/shared/contracts-constellations";

export function StreakCounter({ streakDays, variant = "inline" }: StreakCounterProps) {
  if (streakDays <= 0) return null;

  if (variant === "stat") {
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-[1.9rem] font-extrabold leading-none text-[var(--chronicle-streak)]">
          {streakDays}
        </span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)]">
          day streak
        </span>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--chronicle-streak)]/10 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--chronicle-streak)]">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 1.5l2.6 6.9 7.4.3-5.8 4.6 1.9 7.1L12 16.4l-6.1 4 1.9-7.1L2 8.7l7.4-.3z" />
      </svg>
      DAY {streakDays} · ★ streak
    </span>
  );
}

export default StreakCounter;
