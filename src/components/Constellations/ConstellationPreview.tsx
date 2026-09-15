/**
 * ConstellationPreview — the learn-hub card preview (P1). Renders a compact
 * single-row star field inside the PathCard gradient band. Stays LIGHT by
 * design: one 6px-dot row + a mono `{lit}/{total}` counter, no lines, no
 * labels, no Chronicle. Guests see the locked dots (no progress data ships
 * for guests — only the count).
 */
"use client";

import type { ConstellationPreviewProps } from "@/shared/contracts-constellations";

export function ConstellationPreview({
  constellation,
  compact = true,
}: ConstellationPreviewProps) {
  const { stars, litStars, totalStars } = constellation;

  // Compact: show up to 12 dots; overflow collapses into the counter.
  const shown = compact ? stars.slice(0, 12) : stars;

  return (
    <div
      className="flex flex-col gap-1.5"
      data-testid="constellation-preview"
      aria-label={`${litStars} of ${totalStars} lessons complete`}
    >
      <div className="flex flex-wrap items-center gap-[6px]">
        {shown.map((star) => (
          <span
            key={star.lessonSlug}
            data-testid={`cx-dot-${star.lessonSlug}`}
            aria-hidden
            className={`h-[6px] w-[6px] rounded-full transition-colors duration-300 ${
              star.lit
                ? "bg-[var(--constellation-star-lit)] shadow-[0_0_6px_var(--constellation-halo)]"
                : "bg-white/30"
            }`}
          />
        ))}
        {compact && totalStars > shown.length ? (
          <span className="ml-0.5 font-mono text-[10px] font-bold text-white/70">
            +{totalStars - shown.length}
          </span>
        ) : null}
      </div>
      <span className="font-mono text-[11px] font-bold text-white/90">
        {litStars}/{totalStars}
      </span>
    </div>
  );
}

export default ConstellationPreview;
