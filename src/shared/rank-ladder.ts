/**
 * src/shared/rank-ladder.ts — the constellation rank ladder (ADR-214).
 *
 * Pure display data + deriveRank helper, CLIENT-SAFE (no supabase / next/headers
 * imports) so client components (FullSkySection) can render the ladder without
 * dragging the server-only supabase module into the client bundle.
 *
 * completion.ts re-exports RANK_LADDER for backward compatibility.
 */
import type { Rank, RankBand } from "@/shared/contracts-constellations";

/**
 * The constellation rank ladder (ADR-214). Bands are ASCENDING — ladder[0]
 * is the entry band. A learner's current rank is the highest band whose
 * thresholds (lessons AND courses) are all met. Pure, deterministic, and
 * unit-tested — no DB drift (the ladder lives only in code).
 */
export const RANK_LADDER: RankBand[] = [
  {
    id: "starseed",
    name: "Starseed",
    lessonsRequired: 0,
    coursesRequired: 0,
    description: "Every journey starts with a single star.",
  },
  {
    id: "wayfarer",
    name: "Wayfarer",
    lessonsRequired: 5,
    coursesRequired: 0,
    description: "Five lessons — the path is opening up.",
  },
  {
    id: "explorer",
    name: "Explorer",
    lessonsRequired: 20,
    coursesRequired: 2,
    description: "Two courses charted; the map grows.",
  },
  {
    id: "polestar",
    name: "Polestar",
    lessonsRequired: 50,
    coursesRequired: 4,
    description: "A steady north star across four courses.",
  },
  {
    id: "celestial",
    name: "Celestial",
    lessonsRequired: 100,
    coursesRequired: 8,
    description: "Eight courses, one hundred lessons — you own the sky.",
  },
];

/**
 * Derive a learner's current rank from their completion counts. The highest
 * band whose thresholds (lessons + courses) are met is the current rank;
 * `nextProgressPct` is 0-100 progress toward the NEXT band (100 at the top).
 */
export function deriveRank(
  lessonsCompleted: number,
  coursesCompleted: number,
): Rank {
  let currentIndex = 0;
  RANK_LADDER.forEach((band, i) => {
    if (
      lessonsCompleted >= band.lessonsRequired &&
      coursesCompleted >= band.coursesRequired
    ) {
      currentIndex = i;
    }
  });
  const current = RANK_LADDER[currentIndex]!;
  const next = RANK_LADDER[currentIndex + 1];

  let nextProgressPct = 100;
  if (next) {
    // Progress toward the next band: average of the two threshold ratios
    // (lessons and courses), each capped at 100.
    const lessonPct =
      next.lessonsRequired > 0
        ? Math.min(100, (lessonsCompleted / next.lessonsRequired) * 100)
        : 100;
    const coursePct =
      next.coursesRequired > 0
        ? Math.min(100, (coursesCompleted / next.coursesRequired) * 100)
        : 100;
    nextProgressPct = Math.round((lessonPct + coursePct) / 2);
  }

  return {
    id: current.id,
    name: current.name,
    description: current.description,
    index: currentIndex,
    nextProgressPct,
  };
}
