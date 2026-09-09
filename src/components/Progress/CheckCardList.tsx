/**
 * CheckCardList — knowledge check rows on the series page (copy deck §3).
 *
 * Client component: fetches GET /api/progress/quiz/tiers for per-check pass
 * state (hydration-gated — server renders "Not taken" rows so first paint is
 * identical for guests and returning users; the client fills real scores after
 * mount). Guests see the same list with "Not taken" (each page shows the CTA).
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CheckProgress, KnowledgeCheckMeta, TierProgress } from "@/shared/contracts";

interface CheckCardListProps {
  series: string;
  checksMeta: KnowledgeCheckMeta[];
}

export default function CheckCardList({ series, checksMeta }: CheckCardListProps) {
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
        // guests / no data — rows render as "Not taken"
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [series]);

  const checks: CheckProgress[] = tiers?.checks ?? [];

  const passedCount = checks.filter((c) => c.passed).length;

  return (
    <section aria-label="Knowledge checks on the series page" className="max-w-[760px] mx-auto px-6 pt-2 pb-8">
      <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-emerald-800 uppercase tracking-[0.09em] mb-1.5">
        <span className="w-[3px] h-3 rounded-sm bg-emerald" />
        Knowledge Checks <span className="text-gray-500">· {passedCount}/{checks.length} passed</span>
      </div>
      <h2 className="text-[1.35rem] font-extrabold text-navy tracking-[-0.02em] mb-1.5">
        Milestone checks
      </h2>
      <p className="text-[13px] text-gray-500 dark:text-[var(--ink-muted)] max-w-[640px] leading-relaxed mb-5">
        One 15-question check every five lessons. Pass each with 80%+ to unlock the cert prep exam. Rows link to each check page — guests see the same list, and each page shows the sign-up CTA.
      </p>

      <div className="border border-gray-200 rounded-2xl bg-white overflow-hidden dark:border-[var(--border-default)] dark:bg-[var(--surface-card)]">
        {checksMeta.map((meta, i) => {
          const check = checks.find((c) => c.n === meta.n);
          const bestScore = check?.bestScore ?? 0;
          const passed = check?.passed ?? false;
          const attempts = check?.attempts ?? 0;
          const status = passed
            ? { label: `Passed · ${bestScore}%`, cls: "bg-emerald/10 text-emerald-800 dark:text-emerald-400" }
            : attempts > 0
              ? { label: `${bestScore}% · retake`, cls: "bg-[#FDE8EB] text-red" }
              : { label: "Not taken", cls: "bg-gray-100 text-gray-500 dark:bg-[var(--surface-sunken)] dark:text-[var(--ink-muted)]" };

          return (
            <Link
              key={meta.n}
              href={`/learn/${series}/check/${meta.n}`}
              className={`group flex items-center gap-4 px-5 py-4 no-underline transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-[var(--surface-card-soft)] ${
                i > 0 ? "border-t border-gray-100 dark:border-[var(--border-subtle)]" : ""
              }`}
            >
              <span
                className={`flex-shrink-0 w-11 h-9 rounded-lg font-mono text-[12px] font-bold flex items-center justify-center transition-colors duration-150 ${
                  passed
                    ? "bg-emerald/15 text-emerald-800 group-hover:bg-emerald/25"
                    : "bg-gray-100 text-gray-500 group-hover:bg-navy group-hover:text-white dark:bg-[var(--surface-sunken)] dark:text-[var(--ink-muted)]"
                }`}
              >
                K{meta.n}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold text-gray-800 dark:text-[var(--ink-primary)] truncate">
                  Knowledge Check {meta.n} — Lessons {meta.lessons[0]}–{meta.lessons[1]}
                </span>
              </span>
              <span className={`font-mono text-[10.5px] font-bold px-3 py-1 rounded-full ${status.cls}`}>
                {status.label}
              </span>
              <span aria-hidden="true" className="text-gray-300 dark:text-[var(--border-strong)] text-sm group-hover:text-red group-hover:translate-x-0.5 transition-all duration-200">
                &rarr;
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
