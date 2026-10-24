/**
 * src/lib/search-docs.ts — build the body-free search document index (ADR-220).
 *
 * SERVER-ONLY IN PRACTICE: `buildSearchDocs` itself is pure, but its only
 * consumer is `src/lib/learn-visibility.ts` (which reads the DB) and the
 * `GET /api/search` route. Never import this from a `"use client"` module —
 * `src/lib/client-data-imports.test.ts` fails the build/test if anyone does.
 *
 * The index is a cache of PUBLIC pages, not a privilege escalation:
 *  - posts are public by definition,
 *  - series/lessons are restricted to what the seam calls guest-visible, so a
 *    stealth series never enters the payload,
 *  - every record is metadata only (title / one-line excerpt / route / tags).
 *    Lesson BODIES, MDX, section content and quiz material are never read here.
 */

import { posts } from "@/data/posts";
import type { LearningSeries } from "@/data/types";
import type { SearchDoc } from "@/shared/contracts-search";

/**
 * Keep the payload inside the ≤200 KB raw budget (ADR-220 §5.2). The overlay
 * renders the snippet on one truncated line, so 120 chars is plenty of match
 * surface and leaves headroom for content growth (measured: full index ≈184 KB
 * raw / ≈46 KB gzip with the four launched series).
 */
const SNIPPET_LIMIT = 120;

function snippet(text: string | undefined | null): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  return s.length > SNIPPET_LIMIT ? `${s.slice(0, SNIPPET_LIMIT - 1)}…` : s;
}

/**
 * Build the search index from public posts + the guest-visible series.
 *
 * `visibleSeries` MUST come from `getGuestVisibleSeries()` (the seam). Passing
 * `getAllSeries()`/`learnSeries` here re-introduces S2 and is exactly what the
 * seam exists to prevent.
 */
export function buildSearchDocs(
  visibleSeries: readonly LearningSeries[],
): SearchDoc[] {
  const postDocs: SearchDoc[] = posts.map((p) => ({
    type: "post",
    title: p.title,
    href: `/field-notes/${p.slug}`,
    group: "Posts",
    snippet: snippet(p.excerpt),
    meta: p.category,
    terms: [p.category, ...p.tags, p.slug],
  }));

  const seriesDocs: SearchDoc[] = visibleSeries.map((s) => ({
    type: "series",
    title: s.name,
    href: `/atlas/${s.slug}`,
    group: "Series",
    snippet: snippet(s.description),
    terms: [s.slug, s.name],
  }));

  const lessonDocs: SearchDoc[] = visibleSeries.flatMap((s) =>
    s.lessons.map((l) => ({
      type: "lesson" as const,
      title: l.title,
      href: `/atlas/${s.slug}/${l.slug}`,
      group: "Lessons",
      snippet: snippet(l.excerpt),
      meta: s.name,
      terms: [s.slug, l.slug, ...l.tags],
    })),
  );

  return [...postDocs, ...seriesDocs, ...lessonDocs];
}
