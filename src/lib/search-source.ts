/**
 * src/lib/search-source.ts — the SHAPE of learn data the site-search index is
 * allowed to see (security t_a6b7630b, CWE-200).
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/components/SearchOverlay.tsx` used to import `@/data/learn` directly.
 * That static dataset carries all 12 series — 8 of them stealth, unpublished
 * courses — with names, descriptions, lesson titles/excerpts and dates, so the
 * module was compiled into a client chunk served from every route. Anyone
 * could read the unpublished catalogue out of the JS payload: no session, no
 * credential outage required.
 *
 * Filtering inside `buildSearchIndex` would not have fixed that — the data
 * would still be in the chunk. The fix is to filter BEFORE the server→client
 * boundary and to ship only the fields search actually reads. That is what
 * this module defines: a minimal, serialisable projection of a series / lesson
 * that is safe to hand to a client component, plus the pure functions that
 * project a full record down to it.
 *
 * Pure module (no `@/data/*` import) so the same projection runs on the server
 * that filters the dataset and in the unit tests that assert the fields.
 */

import type { LearnLesson, LearningSeries } from "@/data/types";

/** Series fields the search index matches on / renders. */
export interface SearchSeriesSource {
  slug: string;
  name: string;
  description: string;
}

/** Lesson fields the search index matches on / renders. */
export interface SearchLessonSource {
  slug: string;
  series: string;
  title: string;
  excerpt: string;
  tags: string[];
}

/** Project a full series record down to its public search surface. */
export function toSearchSeriesSource(s: LearningSeries): SearchSeriesSource {
  return { slug: s.slug, name: s.name, description: s.description };
}

/** Project a full lesson record down to its public search surface. */
export function toSearchLessonSource(l: LearnLesson): SearchLessonSource {
  return {
    slug: l.slug,
    series: l.series,
    title: l.title,
    excerpt: l.excerpt,
    tags: l.tags,
  };
}
