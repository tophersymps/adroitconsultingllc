/**
 * ExamCard — cert prep exam card on the series page (copy deck §6).
 *
 * Locked: "Locked — checks passed X/9 · 80% required" + disabled
 * "Complete checks to unlock". Unlocked: "Unlocked — all 9 checks passed" +
 * "Take the exam →". Hydration-gated client fetch of /api/progress/quiz/tiers
 * so the state reflects real per-user progress after mount; the server render
 * (locked, 0/9) matches first paint for guests and returning users.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TierProgress } from "@/shared/contracts";

interface ExamCardProps {
  series: string;
  totalChecks: number;
}

export default function ExamCard({ series, totalChecks }: ExamCardProps) {
  const [tiers, setTiers] = useState<TierProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/progress/quiz/tiers?series=${encodeURIComponent(series)}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) return;
        const data = (await res.json()) as TierProgress;
        if (!cancelled) setTiers(data);
      } catch {
        // guests / no data — locked state with 0 passed
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [series]);

  const unlocked = tiers?.unlocked ?? false;
  const passedCount = tiers?.checks.filter((c) => c.passed).length ?? 0;
  const examBest = tiers?.exam.bestScore ?? 0;

  return (
    <section aria-label="Cert prep exam card" className="max-w-[760px] mx-auto px-6 pb-14">
      <div
        className={`rounded-2xl border bg-white p-5 dark:bg-[var(--surface-card)] dark:border-[var(--border-default)] ${
          unlocked ? "border-emerald/40 shadow-sm" : "border-gray-200"
        }`}
      >
        <div className="flex items-start justify-between gap-4 mb-2.5">
          <div>
            <div className="font-mono text-[10.5px] font-bold text-navy uppercase tracking-[0.09em] mb-1 dark:text-[var(--ink-muted)]">
              Cert Prep Exam
            </div>
            <h3 className="text-[1.15rem] font-extrabold text-navy tracking-[-0.02em] dark:text-[var(--ink-primary)]">
              Certification Prep Exam
            </h3>
          </div>
          <span
            className={`font-mono text-[10.5px] font-bold px-3 py-1 rounded-full ${
              unlocked
                ? "bg-emerald/10 text-emerald-800"
                : "bg-gray-100 text-gray-500 dark:bg-[var(--surface-sunken)] dark:text-[var(--ink-muted)]"
            }`}
          >
            {unlocked ? "Unlocked" : "Locked"}
          </span>
        </div>
        <p className="text-[12.5px] text-gray-500 dark:text-[var(--ink-muted)] mb-4">
          60 questions · 105 minutes · pass ≥ 72%
          {examBest > 0 && (
            <span className="font-mono text-emerald-800 font-bold"> · best {examBest}%</span>
          )}
        </p>

        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-gray-500 dark:text-[var(--ink-muted)] border-t border-gray-100 dark:border-[var(--border-subtle)] pt-3">
          {unlocked ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M9 12l2 2 4-4" />
                <path d="M12 3a9 9 0 1 0 9 9" />
              </svg>
              <span className="text-emerald-800 dark:text-emerald-400">Unlocked — all {totalChecks} checks passed</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <span>
                Locked — checks passed <b className="text-navy dark:text-[var(--ink-primary)]">{passedCount}/{totalChecks}</b> · 80% required
              </span>
            </>
          )}
        </div>

        {/* Unlock progress bar (locked only) */}
        {!unlocked && (
          <div className="h-[5px] rounded-full bg-gray-200 dark:bg-[var(--border-default)] overflow-hidden mt-2.5 mb-3.5">
            <div
              className="h-full rounded-full bg-emerald transition-[width] duration-300"
              style={{ width: `${totalChecks > 0 ? (passedCount / totalChecks) * 100 : 0}%` }}
            />
          </div>
        )}

        {unlocked ? (
          <Link
            href={`/learn/${series}/exam`}
            className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-navy text-white text-[13.5px] font-bold no-underline hover:bg-navy-light active:scale-[0.98] transition-all duration-150"
          >
            Take the exam
            <span aria-hidden="true">&rarr;</span>
          </Link>
        ) : (
          <button
            disabled
            className="w-full h-11 rounded-xl bg-gray-100 text-gray-400 text-[13.5px] font-bold cursor-not-allowed dark:bg-[var(--surface-sunken)] dark:text-[var(--ink-faint)]"
          >
            Complete checks to unlock
          </button>
        )}
      </div>
    </section>
  );
}
