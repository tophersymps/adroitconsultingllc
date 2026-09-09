/**
 * PathConstellation — client adapter that assembles a course's constellation
 * for the /learn hub PathCard preview. Signed-in: lit stars from the merged
 * progress summary (localStorage + Supabase) over the card's lesson slugs.
 * Guests: synthetic locked dots (no per-lesson data ships for guests — only
 * the total), so the preview stays a shape without leaking lesson metadata.
 */
"use client";

import { useMemo } from "react";
import type { LearnCardSeries } from "@/data/types";
import { useProgressSummary } from "@/lib/hooks/useProgressSummary";
import { buildConstellation } from "@/lib/sky";
import { ConstellationPreview } from "@/components/Constellations/ConstellationPreview";
import type { ConstellationState } from "@/shared/contracts-constellations";

export function PathConstellation({
  series,
  isGuest,
}: {
  series: LearnCardSeries;
  isGuest: boolean;
}) {
  const { merge } = useProgressSummary([], series.lessonSlugs);

  const constellation = useMemo<ConstellationState>(() => {
    if (isGuest) {
      // Guest: synthetic locked star field (no lesson metadata ships).
      return {
        courseId: series.slug,
        seriesSlug: series.slug,
        name: series.name,
        gradient: series.gradient,
        totalStars: series.totalLessons,
        curriculumLessons: series.curriculumLessons ?? series.totalLessons,
        litStars: 0,
        complete: false,
        stars: Array.from({ length: series.totalLessons }, (_, i) => ({
          lessonSlug: `${series.slug}:star-${i + 1}`,
          index: i + 1,
          label: "",
          lit: false,
        })),
      };
    }
    return buildConstellation({
      courseId: series.slug,
      seriesSlug: series.slug,
      name: series.name,
      gradient: series.gradient,
      lessonSlugs: series.lessonSlugs,
      completedSlugs: merge.lessons,
    });
  }, [series, isGuest, merge.lessons]);

  if (series.totalLessons === 0) return null;

  return <ConstellationPreview constellation={constellation} compact />;
}

export default PathConstellation;
