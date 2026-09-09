/**
 * SeriesConstellation — the series-outline full constellation (P1). A vertical
 * star rail shown beside the syllabus: one star per planned lesson, lit/current/
 * locked, connected by horizontal draw rails. Guests see the locked/lit shape
 * without per-lesson progress labels (isGuest).
 */
"use client";

import Link from "next/link";
import type { SeriesConstellationProps } from "@/shared/contracts-constellations";

export function SeriesConstellation({
  constellation,
  isGuest,
}: SeriesConstellationProps) {
  const { stars, litStars, totalStars, seriesSlug, name } = constellation;

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="series-constellation"
      aria-label={`${name} constellation — ${litStars} of ${totalStars} stars lit`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--ink-faint)]">
          {name} constellation
        </span>
        <span className="font-mono text-[11px] font-bold text-[var(--ink-muted)]">
          {litStars}/{totalStars}
        </span>
      </div>

      <ol className="flex flex-col gap-0.5">
        {stars.map((star, i) => (
          <li key={star.lessonSlug} className="flex items-center gap-3">
            <span className="flex flex-col items-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className="cx-link draw"
                  data-testid={`cx-link-${i}`}
                />
              )}
              <span
                data-testid={`cx-star-${star.lessonSlug}`}
                aria-hidden
                className={`cx-star ${star.lit ? "is-lit" : isGuest ? "is-locked" : ""}`}
              />
            </span>
            {!isGuest && (
              <Link
                href={`/learn/${seriesSlug}/${star.lessonSlug}`}
                className="min-w-0 truncate text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors duration-150 no-underline"
              >
                {star.label}
              </Link>
            )}
          </li>
        ))}
      </ol>

      {constellation.complete && (
        <p className="mt-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--constellation-star-lit)]">
          ✦ Constellation complete.
        </p>
      )}
    </div>
  );
}

export default SeriesConstellation;
