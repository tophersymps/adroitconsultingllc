/**
 * constellation-pool.ts — the used/available pool of authorable constellations.
 *
 * This is the source of truth for "which constellations are still available to
 * assign to a new course." It derives state from two existing sources so they
 * can never drift apart:
 *
 *  - `FIGURE_PINS_ALL` (figure-pins.server.ts) is the FULL assignment registry —
 *    a pinned course moves its constellation to "used." The client map
 *    (`FIGURE_PINS`) is only the *published* projection (four series), so using
 *    it here would offer a stealth course's reserved constellation to a new
 *    launch. This module is therefore server/test-side only: importing it from a
 *    Client Component fails the build via `import "server-only"` in
 *    `figure-pins.server.ts`.
 *  - `CONSTELLATION_FIGURES` (figure-catalog.ts) is the set of authorable
 *    figures (those with real star coordinates). A course can only draw a
 *    figure that has coordinates, so only these are "alignable."
 *
 * The IAU-88 plates are the *art* pool — every one has an engraving, but only
 * the 30 with star coordinates can light per lesson. So "available" here means
 * *authorable-and-unpinned*; the art-only plates remain a future pool until a
 * figure is authored for them (Phase 3 was "needed sizes," not all 88).
 *
 * Pure and deterministic, like the rest of the chart layer. No React, no DOM.
 */
import { CONSTELLATION_FIGURES } from "./figure-catalog";
import { FIGURE_PINS_ALL } from "./figure-pins.server";
import type { ConstellationFigure } from "./figure-catalog";

/** The figure names a course currently owns (pinned). */
export function usedConstellationNames(pins: Readonly<Record<string, string>> = FIGURE_PINS_ALL): Set<string> {
  return new Set(Object.values(pins));
}

/** The authorable figures that are NOT currently assigned to any course. */
export function availableFigures(
  pins: Readonly<Record<string, string>> = FIGURE_PINS_ALL,
): ConstellationFigure[] {
  const used = usedConstellationNames(pins);
  return CONSTELLATION_FIGURES.filter((f) => !used.has(f.name));
}

/** How many of the 88 plates are authorable figures vs art-only. */
export function poolCapacity(): { authorable: number; artOnly: number; total: number } {
  return {
    authorable: CONSTELLATION_FIGURES.length,
    artOnly: 88 - CONSTELLATION_FIGURES.length,
    total: 88,
  };
}

/**
 * Recommend the best available constellation for a new course of `lessonCount`
 * lessons. Size-matched by star count (closest to the lesson count, ties toward
 * the larger figure then by name — matches `assignFigures`'s tie-breaking), and
 * only ever from the *available* (non-pinned) pool.
 *
 * Returns the figure, or null when none are free.
 */
export function recommendForLessonCount(
  lessonCount: number,
  pins: Readonly<Record<string, string>> = FIGURE_PINS_ALL,
): ConstellationFigure | null {
  const pool = availableFigures(pins);
  if (pool.length === 0) return null;
  const target = Math.max(1, lessonCount);
  let best: ConstellationFigure | null = null;
  let bestDistance = Infinity;
  for (const f of pool) {
    const distance = Math.abs(f.stars.length - target);
    const better =
      best === null ||
      distance < bestDistance ||
      (distance === bestDistance && (f.stars.length > best.stars.length));
    if (better) {
      best = f;
      bestDistance = distance;
    }
  }
  return best;
}