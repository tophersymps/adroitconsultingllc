/**
 * B-21 — Client-side site search (discovery/consolidated-backlog.md).
 *
 * Searches the static datasets `posts.ts` + `learn.ts` (both plain generated
 * TS — no Node-only imports, safe for client bundles). Results are grouped by
 * post / series / lesson. No backend needed: both datasets are static imports.
 *
 * Pure functions only — mirrors the learn-client.ts convention.
 */

import type { BlogPost, LearnLesson, LearningSeries } from "@/data/types";

export interface SearchHit {
  type: "post" | "series" | "lesson";
  title: string;
  /** Route to navigate to when the result is clicked. */
  href: string;
  /** Group label shown in the overlay (post/series/lesson). */
  group: string;
  /** Short excerpt snippet (post excerpt, series description, lesson excerpt). */
  snippet: string;
  /** Optional secondary meta (series name for lessons, etc.). */
  meta?: string;
}

export interface SearchResults {
  posts: SearchHit[];
  series: SearchHit[];
  lessons: SearchHit[];
  total: number;
}

/** Lowercase + trim, with diacritics folded for forgiving matching. */
function normalize(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Whether `query` matches a tokenizable field value. */
function matches(query: string, ...fields: string[]): boolean {
  const q = normalize(query);
  if (!q) return false;
  return fields.some((f) => normalize(f).includes(q));
}

/**
 * Build a grouped search index over all three datasets. Runs on the client at
 * open time (cold import of the static modules, then cheap substring scans).
 */
export function buildSearchIndex(
  allPosts: BlogPost[],
  allSeries: LearningSeries[],
  allLessons: LearnLesson[],
): (query: string) => SearchResults {
  return function search(query: string): SearchResults {
    const q = normalize(query);
    if (!q) return { posts: [], series: [], lessons: [], total: 0 };

    const posts: SearchHit[] = allPosts
      .filter((p) =>
        matches(q, p.title, p.excerpt, p.category, ...p.tags, p.slug),
      )
      .slice(0, 8)
      .map((p) => ({
        type: "post" as const,
        title: p.title,
        href: `/blog/${p.slug}`,
        group: "Posts",
        snippet: p.excerpt,
        meta: p.category,
      }));

    const series: SearchHit[] = allSeries
      .filter((s) => matches(q, s.name, s.description, s.slug))
      .slice(0, 5)
      .map((s) => ({
        type: "series" as const,
        title: s.name,
        href: `/learn/${s.slug}`,
        group: "Series",
        snippet: s.description,
      }));

    const lessons: SearchHit[] = allLessons
      .filter((l) =>
        matches(q, l.title, l.excerpt, l.series, ...l.tags, l.slug),
      )
      .slice(0, 10)
      .map((l) => ({
        type: "lesson" as const,
        title: l.title,
        href: `/learn/${l.series}/${l.slug}`,
        group: "Lessons",
        snippet: l.excerpt,
      }));

    return {
      posts,
      series,
      lessons,
      total: posts.length + series.length + lessons.length,
    };
  };
}
