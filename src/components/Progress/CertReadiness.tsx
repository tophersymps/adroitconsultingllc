/**
 * CertReadiness — tier-aware progress rollup for the series header (§9).
 *
 * "Lessons X/46 · Checks X/9 · Exam best Y%" + weighted readiness bar
 * (lessons 40% / checks 30% / exam best 30% — ADR-107). Fetches
 * GET /api/progress/quiz/tiers (hydration-gated; server renders nothing for
 * first paint, so guests/returning users never mismatch).
 */
"use client";

import { useEffect, useState } from "react";
import type { TierProgress } from "@/shared/contracts";

interface CertReadinessProps {
  series: string;
  /** Where the strip sits — controls onGradient (white) treatment. */
  onGradient?: boolean;
}

export default function CertReadiness({ series, onGradient = false }: CertReadinessProps) {
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
        // no data — render nothing (never invent stats)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [series]);

  // Hydration gate + "never invent stats": show nothing until the fetch lands
  // and there is some progress.
  if (!tiers) return null;
  const { lessons, checks, exam } = tiers;
  const checksPassed = checks.filter((c) => c.passed).length;
  if (lessons.completed === 0 && checksPassed === 0 && exam.attempts === 0) return null;

  const lessonsPct = lessons.total > 0 ? (lessons.completed / lessons.total) * 100 : 0;
  const checksPct = checks.length > 0 ? (checksPassed / checks.length) * 100 : 0;
  const readinessPct = Math.round(
    lessonsPct * 0.4 + checksPct * 0.3 + exam.bestScore * 0.3,
  );

  const tone = onGradient
    ? "text-white bg-black/55 backdrop-blur-sm px-3 py-2 rounded-2xl"
    : "text-gray-500";

  return (
    <div className={`mt-3 ${tone}`}>
      <div className="font-mono text-[10.5px] font-semibold leading-relaxed">
        Lessons {lessons.completed}/{lessons.total} · Checks {checksPassed}/{checks.length} · Exam best {exam.bestScore}%
      </div>
      <div className="mt-1.5">
        <div className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.08em] opacity-70 mb-1">
          <span>Certification readiness</span>
          <span>{readinessPct}%</span>
        </div>
        <div className="h-[5px] rounded-full bg-black/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald transition-[width] duration-500"
            style={{ width: `${readinessPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
