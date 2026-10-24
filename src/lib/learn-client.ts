/**
 * Client-safe Learn helpers — no Node-only imports (no fs/path), safe to
 * import from client components. Pure functions only.
 *
 * ADR-221: the slug → short-label MAP no longer lives here. It is server-side
 * data (`seriesShortLabel` in `src/lib/learn.ts`) projected onto the card as
 * `LearnCardSeries.shortLabel`, so a stealth series' human name can never be
 * compiled into a client chunk (S4). This module keeps only the pure
 * humanizer used as the card's fallback when a course has no authored label.
 */

/** Humanize a series slug: `omni-studio-cert` → `Omni Studio Cert`. */
export function humanizeSeriesSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
