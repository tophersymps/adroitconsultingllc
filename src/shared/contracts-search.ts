/**
 * src/shared/contracts-search.ts — the site-search wire contract (ADR-220).
 *
 * SHARED between the server (`GET /api/search`, `src/lib/search-docs.ts`) and
 * the client (`src/components/SearchOverlay.tsx`). Keep it free of Node-only
 * imports so both graphs can load it.
 *
 * WHY A CONTRACT: before ADR-220 the overlay imported `@/data/learn` and
 * `@/data/posts` directly, which shipped the entire learn dataset (including
 * stealth series and every lesson body) to every visitor in one static chunk.
 * The client now receives ONLY these document records — a body-free projection
 * of what a guest can already browse — and matches them locally.
 */

/** Which result group a document belongs to (rendered as the group label). */
export type SearchDocType = "post" | "series" | "lesson";

/**
 * One searchable record. Deliberately carries NO body/section/content field:
 * `snippet` is a one-line excerpt, and `terms` holds only short match-only
 * tokens (category, series name, tags, slug) — never lesson prose.
 */
export interface SearchDoc {
  type: SearchDocType;
  /** Display title. */
  title: string;
  /** Route to navigate to when the result is clicked. */
  href: string;
  /** Group label shown in the overlay ("Posts" / "Series" / "Lessons"). */
  group: string;
  /** One-line excerpt shown under the title (already length-capped). */
  snippet: string;
  /** Optional secondary meta (post category for posts, etc.). */
  meta?: string;
  /**
   * Match-only terms: lowercase-insensitive keywords the query is tested
   * against in addition to title/snippet (category, series, tags, slug).
   */
  terms: string[];
}

/** A rendered hit — the document minus its match-only `terms`. */
export interface SearchHit {
  type: SearchDocType;
  title: string;
  href: string;
  group: string;
  snippet: string;
  meta?: string;
}

/** Grouped result set returned by `searchDocs()` and rendered by the overlay. */
export interface SearchResults {
  posts: SearchHit[];
  series: SearchHit[];
  lessons: SearchHit[];
  total: number;
}

/** `GET /api/search` response envelope. */
export interface SearchIndexResponse {
  /** Bumped when the document shape changes (cache-busting for clients). */
  version: 1;
  docs: SearchDoc[];
}
