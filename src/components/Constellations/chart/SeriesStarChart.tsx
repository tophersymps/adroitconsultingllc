/**
 * SeriesStarChart.tsx — the on-course tracker at `/atlas/[series]`.
 *
 * Upgraded from the static 17th-century engraving chart to the interactive
 * Adroit Tron-Matrix Roadmap (`SeriesTronRoadmap`), color-matched to the
 * Adroit Consulting brand tokens.
 */
"use client";

import type { ConstellationState } from "@/shared/contracts-constellations";
import { SeriesTronRoadmap } from "../roadmap/SeriesTronRoadmap";

export interface SeriesStarChartProps {
  constellation: ConstellationState;
  isGuest?: boolean;
  /**
   * Legacy override. When omitted (normal), the constellation's own
   * `examPassed` (server-graded quiz_attempt) drives the crown — the same
   * source the profile sky uses.
   */
  examPassed?: boolean;
}

export function SeriesStarChart({
  constellation,
  isGuest = false,
  examPassed,
}: SeriesStarChartProps) {
  const effectiveConstellation =
    examPassed !== undefined ? { ...constellation, examPassed } : constellation;

  return (
    <SeriesTronRoadmap
      constellation={effectiveConstellation}
      isGuest={isGuest}
    />
  );
}

export default SeriesStarChart;
