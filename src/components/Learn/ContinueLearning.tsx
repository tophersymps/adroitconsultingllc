/**
 * ContinueLearning — "Continue learning" section at the top of the Learn hub
 * (signed-in only). Fetches GET /api/continue-learning (in-progress series,
 * most-recent-first) and renders resume cards. Guests / no in-progress →
 * renders nothing.
 *
 * CLS (PERF-MEDIUM-1, t_ea10119b): this section sits ABOVE the card grid, so
 * returning `null` while the read is in flight inserted ~160-190px after
 * hydration and pushed every card row down on signed-in loads. The pending
 * state now renders a placeholder at the SAME height as one resume card
 * (`RESERVE` + the shared `CARD_FRAME`), so the resolved card lands in space
 * that is already accounted for. Heights were measured in a real browser (see
 * RESERVE below); the empty case still renders nothing, exactly as before.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ContinueLearningItem } from "@/shared/contracts-account";

/**
 * Frame shared by the pending placeholder and the real resume card: same
 * border/radius/shadow, same `mb-3 last:mb-0` (both are the only/section-last
 * child in the single-item case), and `flex` so the inner row stretches to the
 * reserved height instead of hugging the top of the box.
 */
const CARD_FRAME =
  "flex relative overflow-hidden rounded-[20px] border border-[var(--border-default)] bg-[var(--surface-inverse)] text-[var(--ink-on-inverse)] shadow-card mb-3 last:mb-0";

/**
 * Reserved height for one resume card, measured on the built CSS in a real
 * browser (Chrome, 320-1440px) against production-shaped content
 * ("3 of 12 lessons complete · next: Introduction to Salesforce Objects"):
 *
 *   <768px  natural height 159-204px (the resume button wraps under the text,
 *           the description wraps at narrow widths) → floor at 208px
 *   >=768px natural height 108px (single row)                        → floor at 112px
 *
 * The floor is applied to BOTH states, so every realistic card resolves to
 * exactly the reserved height: the placeholder and the card are the same size
 * and the first card row does not move. A card whose title/description wraps
 * past this budget, or a second in-progress series (each card adds its own
 * gap + height; the placeholder reserves one), can still push the grid — see
 * the CHANGELOG "Known Issues".
 */
const RESERVE = "min-h-[208px] md:min-h-[112px]";

export default function ContinueLearning() {
  const [items, setItems] = useState<ContinueLearningItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/continue-learning", { cache: "no-store" });
        if (!res.ok) {
          // Hide the reserved placeholder instead of leaving it pulsing forever.
          if (!cancelled) setItems([]);
          return;
        }
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

  // In flight → reserve one card's space so the section does not insert itself
  // above the grid once the read settles (PERF-MEDIUM-1).
  if (!items) {
    return (
      <section
        aria-label="Continue learning"
        aria-busy="true"
        data-testid="continue-learning-placeholder"
        className="mt-9"
      >
        <div
          aria-hidden
          data-testid="continue-learning-placeholder-card"
          className={`${CARD_FRAME} ${RESERVE} animate-pulse`}
        >
          <div className="relative w-full flex flex-wrap items-center justify-between gap-3 sm:gap-4 px-5 sm:px-7 py-5">
            <div className="min-w-0">
              <div className="h-[15px] w-32 max-w-full rounded bg-white/15 mb-1" />
              <div className="h-[26px] w-56 max-w-full rounded bg-white/20 mb-1" />
              <div className="h-[19px] w-64 max-w-full rounded bg-white/10" />
            </div>
            <div className="h-[38px] w-[136px] rounded-full bg-white/10" />
          </div>
        </div>
      </section>
    );
  }

  // Guest / nothing in progress → hide entirely (unchanged).
  if (items.length === 0) return null;

  return (
    <section aria-label="Continue learning" className="mt-9">
      {items.map((item) => (
        <div
          key={item.seriesSlug}
          data-card
          className={`${CARD_FRAME} ${RESERVE}`}
        >
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(60% 120% at 88% 10%, rgba(200,16,46,0.28) 0%, transparent 55%)",
            }}
          />
          <div className="relative w-full flex flex-wrap items-center justify-between gap-3 sm:gap-4 px-5 sm:px-7 py-5">
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
                href={`/atlas/${item.seriesSlug}/${item.nextLessonSlug}`}
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
