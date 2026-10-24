/**
 * B-21 — Client-side site search matching (discovery/consolidated-backlog.md).
 *
 * ADR-220: this module is DATASET-AGNOSTIC and pure. It matches a
 * already-filtered, body-free document index (`SearchDoc[]`, delivered by
 * `GET /api/search`) — it does NOT import `@/data/posts` or `@/data/learn`.
 * The old version did, which shipped the whole learn dataset (stealth series,
 * lesson bodies) to every visitor in one static client chunk (S2).
 *
 * Pure functions only — safe for the client bundle.
 */

import type {
  SearchDoc,
  SearchHit,
  SearchResults,
} from "@/shared/contracts-search";

export type { SearchDoc, SearchHit, SearchResults } from "@/shared/contracts-search";

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

function toHit(doc: SearchDoc): SearchHit {
  return {
    type: doc.type,
    title: doc.title,
    href: doc.href,
    group: doc.group,
    snippet: doc.snippet,
    ...(doc.meta ? { meta: doc.meta } : {}),
  };
}

/** A document matches when its title, snippet or any match term contains the query. */
function docMatches(query: string, doc: SearchDoc): boolean {
  return matches(query, doc.title, doc.snippet, ...(doc.terms ?? []));
}

/**
 * Match a query against the fetched document index. Grouped by post / series /
 * lesson, with the same limits and ordering as before (source order, capped).
 * Empty query ⇒ empty result set.
 */
export function searchDocs(
  docs: readonly SearchDoc[],
  query: string,
): SearchResults {
  const q = normalize(query);
  if (!q) return { posts: [], series: [], lessons: [], total: 0 };

  const posts: SearchHit[] = [];
  const series: SearchHit[] = [];
  const lessons: SearchHit[] = [];

  for (const doc of docs) {
    if (!docMatches(q, doc)) continue;
    if (doc.type === "post" && posts.length < 8) posts.push(toHit(doc));
    else if (doc.type === "series" && series.length < 5) series.push(toHit(doc));
    else if (doc.type === "lesson" && lessons.length < 10)
      lessons.push(toHit(doc));
  }

  return {
    posts,
    series,
    lessons,
    total: posts.length + series.length + lessons.length,
  };
}

/** Empty result set (shared constant shape for the overlay's initial state). */
export const EMPTY_SEARCH_RESULTS: SearchResults = {
  posts: [],
  series: [],
  lessons: [],
  total: 0,
};
