/**
 * ContinueLearning — "Continue learning" section at the top of the Learn hub
 * (signed-in only). Fetches GET /api/continue-learning (in-progress series,
 * most-recent-first) and renders resume cards. Guests / no in-progress →
 * renders nothing.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ContinueLearningItem } from "@/shared/contracts-account";

export default function ContinueLearning() {
  const [items, setItems] = useState<ContinueLearningItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/continue-learning", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { items: ContinueLearningItem[] };
        if (!cancelled) setItems(data.items ?? []);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Loading / guest ([] from server) → hide entirely.
  if (!items || items.length === 0) return null;

  return (
    <section aria-label="Continue learning" className="mb-7">
      {items.map((item) => (
        <div
          key={item.seriesSlug}
          className="relative overflow-hidden rounded-[20px] border border-[var(--border-default)] bg-[var(--surface-inverse)] text-[var(--ink-on-inverse)] shadow-card mb-3 last:mb-0"
        >
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(60% 120% at 88% 10%, rgba(200,16,46,0.28) 0%, transparent 55%)",
            }}
          />
          <div className="relative flex flex-wrap items-center justify-between gap-3 sm:gap-4 px-5 sm:px-7 py-5">
            <div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-white/65 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" aria-hidden />
                Continue learning
              </div>
              <h2 className="text-[19px] font-extrabold tracking-[-0.01em] leading-snug mb-0.5">
                {item.seriesName}
              </h2>
              <div className="text-[12.5px] text-white/70">
                {item.nextLessonTitle
                  ? `${item.completedCount} of ${item.totalLessons} lessons complete · next: ${item.nextLessonTitle}`
                  : `${item.completedCount} of ${item.totalLessons} lessons complete`}
              </div>
            </div>
            {item.nextLessonSlug && (
              <Link
                href={`/learn/${item.seriesSlug}/${item.nextLessonSlug}`}
                className="inline-flex items-center gap-2 bg-[var(--accent)] text-white dark:text-[#0f172a] text-[13px] font-bold px-5 py-2.5 rounded-full no-underline hover:bg-[var(--accent-hover)] hover:translate-x-0.5 hover:shadow-lg transition-all duration-150"
              >
                Resume lesson <span aria-hidden>&rarr;</span>
              </Link>
            )}
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20" aria-hidden>
            <div
              className="h-full rounded-r-full"
              style={{
                width: `${item.percent}%`,
                background: "linear-gradient(90deg, #E8354A, #ff6b7a)",
              }}
            />
          </div>
        </div>
      ))}
    </section>
  );
}
