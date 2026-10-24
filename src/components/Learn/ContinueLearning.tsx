/**
 * ContinueLearning — "Continue learning" shelf at the top of the Learn hub.
 *
 * The shelf ALWAYS renders exactly one card-shaped row inside the same
 * `CARD_FRAME` + `RESERVE` box (t_bbc735da, design t_92956e91):
 *
 *   - GET /api/continue-learning resolved with 1+ series → the resume card(s)
 *   - everything else (in flight, `[]`, a failed read, a rejected fetch) → the
 *     "start here" strip
 *
 * CLS (PERF-MEDIUM-1, t_ea10119b → follow-up t_bbc735da): this section sits
 * ABOVE the card grid. Returning `null` while the read was in flight inserted
 * ~160-190px after hydration; returning `null` for `items.length === 0` removed
 * the reservation again once the read settled, collapsing the catalogue upward
 * for every guest — the majority path on a public hub. The strip is the
 * prerendered first paint, so the slot is filled BEFORE hydration and never
 * changes height in either direction: only its contents swap, with a 140ms
 * opacity crossfade (neutralised by the global `prefers-reduced-motion` block
 * in globals.css).
 *
 * Copy rules (read the design handoff before editing any string): never assert
 * the visitor's state — a guest's completion lives in localStorage
 * (`src/lib/progress.ts`) and is invisible to the session-gated API, so
 * "nothing in progress yet" would be wrong — and never promise persistence.
 * The pulse dot and the red radial glow are live-data signals and belong only
 * to the resume card.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ContinueLearningItem } from "@/shared/contracts-account";

/**
 * Frame shared by the start strip and the resume card: same border/radius/
 * shadow, same `mb-3 last:mb-0` (both are the only/section-last child in the
 * single-item case), and `flex` so the inner row stretches to the reserved
 * height instead of hugging the top of the box.
 */
const CARD_FRAME =
  "flex relative overflow-hidden rounded-[20px] border border-[var(--border-default)] bg-[var(--surface-inverse)] text-[var(--ink-on-inverse)] shadow-card mb-3 last:mb-0";

/**
 * Reserved height for one shelf card, measured on the built CSS in a real
 * browser (Chrome, 320-1440px) against production-shaped content
 * ("3 of 12 lessons complete · next: Introduction to Salesforce Objects"):
 *
 *   <768px  natural height 159-204px (the CTA wraps under the text, the
 *           description wraps at narrow widths) → floor at 208px
 *   >=768px natural height 108px (single row)                        → floor at 112px
 *
 * Both states apply the floor. The start strip's content block measures 63px
 * at 1440px — exactly the resume card's — and 89px at 390px against the card's
 * 108px, the difference absorbed by the centred row inside the 208px floor, so
 * the swap moves zero pixels outside the box. Do NOT re-tune this value: it is
 * the measurement `987d4bf6` proved and t_92956e91 re-verified.
 *
 * A card whose title/description wraps past this budget, or a second
 * in-progress series (each card adds its own gap + height; the reservation is
 * one card), can still push the grid — see the CHANGELOG "Known Issues".
 */
const RESERVE = "min-h-[208px] md:min-h-[112px]";

/** Inner row — one shared geometry for both states, so heights cannot drift. */
const ROW =
  "relative w-full flex flex-wrap items-center justify-between gap-3 sm:gap-4 px-5 sm:px-7 py-5";

/**
 * The CTA pill. Byte-identical on "Start track" and "Resume lesson": the 36px
 * pill height is pre-existing, shared debt (below the 44px target) — bump both
 * together or neither.
 */
const PILL =
  "inline-flex items-center gap-2 bg-[var(--accent)] text-white dark:text-[#0f172a] text-[13px] font-bold px-5 py-2.5 rounded-full no-underline hover:bg-[var(--accent-hover)] hover:translate-x-0.5 hover:shadow-lg transition-all duration-150";

/** Eyebrow, minus the pulse dot (that dot is a live-data signal). */
const EYEBROW =
  "flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-white/65 mb-1";

/** The shared 4px rail: on every card, empty when there is no progress. */
const RAIL = "absolute bottom-0 left-0 right-0 h-1 bg-white/20";

/** Last-resort anchor when the hub has neither a track nor a section. */
const FALLBACK_HREF = "#atlas-catalogue";

export interface ContinueLearningProps {
  /**
   * First published course in UNFILTERED catalog order — `LearnHub`'s
   * `courses[0]`, not the search-filtered list, so the strip does not rename
   * itself while someone types in the search box. Absent → Variant A copy.
   */
  firstTrack?: { slug: string; name: string };
  /** Anchor to the first rendered section, used by the Variant A CTA. */
  browseHref?: string;
}

export default function ContinueLearning({ firstTrack, browseHref }: ContinueLearningProps) {
  const [items, setItems] = useState<ContinueLearningItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/continue-learning", { cache: "no-store" });
        if (!res.ok) {
          // Degraded read → the start strip: the shelf says what it can offer,
          // not what it knows. Never a spinner left running forever.
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

  const cards = items ?? [];
  const hasProgress = cards.length > 0;
  // One state, one key for the crossfade. The prerendered first paint
  // (`items === null`) carries no animation class, so nothing fades on load;
  // only the swap after the read settles does.
  const state = hasProgress ? "resume" : "start";

  return (
    <section aria-label="Continue learning" className="mt-9" data-state={state}>
      <div key={state} className={items === null ? undefined : "continue-fade"}>
        {hasProgress ? (
          cards.map((item) => (
            <div key={item.seriesSlug} data-card className={`${CARD_FRAME} ${RESERVE}`}>
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(60% 120% at 88% 10%, rgba(200,16,46,0.28) 0%, transparent 55%)",
                }}
              />
              <div className={ROW}>
                <div>
                  <div className={EYEBROW}>
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse"
                      aria-hidden
                    />
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
                  <Link href={`/atlas/${item.seriesSlug}/${item.nextLessonSlug}`} className={PILL}>
                    Resume lesson <span aria-hidden>&rarr;</span>
                  </Link>
                )}
              </div>
              <div className={RAIL} aria-hidden>
                <div
                  className="h-full rounded-r-full"
                  style={{
                    width: `${item.percent}%`,
                    background: "linear-gradient(90deg, #E8354A, #ff6b7a)",
                  }}
                />
              </div>
            </div>
          ))
        ) : (
          <div
            data-card
            data-testid="continue-learning-start"
            className={`${CARD_FRAME} ${RESERVE}`}
          >
            <div className={ROW}>
              <div className="min-w-0">
                <div className={EYEBROW}>Continue learning</div>
                <h2 className="text-[19px] font-extrabold tracking-[-0.01em] leading-snug mb-0.5">
                  {firstTrack ? `Start with ${firstTrack.name}` : "Start with any track below"}
                </h2>
                <div className="text-[12.5px] text-white/70">
                  Tracks are read in order. Open lesson 1 to begin.
                </div>
              </div>
              <Link
                href={firstTrack ? `/atlas/${firstTrack.slug}` : (browseHref ?? FALLBACK_HREF)}
                className={PILL}
              >
                {firstTrack ? "Start track" : "Browse tracks"}{" "}
                <span aria-hidden>&rarr;</span>
              </Link>
            </div>
            {/* Empty bar: 0% IS the "nothing yet" signal — no gradient. */}
            <div className={RAIL} aria-hidden>
              <div className="h-full rounded-r-full" style={{ width: "0%" }} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
