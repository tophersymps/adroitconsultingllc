/**
 * src/lib/learn-public.ts — the SERVER-SIDE boundary for learn data that
 * anonymous surfaces may disclose (security t_a6b7630b, MEDIUM, CWE-200).
 *
 * Doctrine (settled by t_0194c233 / t_2cc94bb7 — do not re-litigate):
 * a series may be named or listed publicly **iff**
 * `isPubliclyLaunchedSeries(slug)`. `PUBLICLY_LAUNCHED_SERIES` in
 * `src/lib/atlas-launch.ts` owns DISCLOSURE / NAMING; DB `courses.status` owns
 * ACCESS / RENDERING. This module only answers the disclosure question.
 *
 * The imports here are the FULL dataset (`@/data/learn`, ~1 MB, 12 series of
 * which 8 are stealth). That is why `import "server-only"` is mandatory: if a
 * client component ever imports this module — directly or transitively through
 * a "use client" file — the Next build fails instead of shipping the stealth
 * catalogue. Never re-export `learnSeries` / `learnLessons` from here.
 */

import "server-only";

import { learnLessons, learnSeries } from "@/data/learn";
import { isPubliclyLaunchedSeries } from "@/lib/atlas-launch";
import {
  toSearchLessonSource,
  toSearchSeriesSource,
  type SearchLessonSource,
  type SearchSeriesSource,
} from "@/lib/search-source";
import type { LearnLesson, LearningSeries } from "@/data/types";

/** Publicly launched series only, full records (server-side use only). */
export function getPublicLearnSeries(): LearningSeries[] {
  return learnSeries.filter((s) => isPubliclyLaunchedSeries(s.slug));
}

/** Lessons that belong to a publicly launched series, full records. */
export function getPublicLearnLessons(): LearnLesson[] {
  return learnLessons.filter((l) => isPubliclyLaunchedSeries(l.series));
}

/**
 * The serialisable payload the site-search overlay may receive: launched
 * series/lessons only, projected to the fields search reads. This is the ONLY
 * learn data that crosses into the client graph.
 */
export interface PublicSearchData {
  series: SearchSeriesSource[];
  lessons: SearchLessonSource[];
}

export function getPublicSearchData(): PublicSearchData {
  return {
    series: getPublicLearnSeries().map(toSearchSeriesSource),
    lessons: getPublicLearnLessons().map(toSearchLessonSource),
  };
}
