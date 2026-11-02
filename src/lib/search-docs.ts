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
 * renders the snippet on one truncated line, so 96 chars is still plenty of
 * match surface. Tightened from 120 on 2026-11-02, when the index (436 docs)
 * crossed the budget at 208.6 KB raw; at 96 with deduped `terms` it measures
 * 197.2 KB raw, inside the ≤200 KB ADR-220 §5.2 budget.
 */
const SNIPPET_LIMIT = 96;

function snippet(text: string | undefined | null): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  return s.length > SNIPPET_LIMIT ? `${s.slice(0, SNIPPET_LIMIT - 1)}…` : s;
}

/** Match-only terms, deduped (tags repeat across docs); empty parts dropped. */
function terms(...parts: (string | undefined | null)[]): string[] {
  return Array.from(new Set(parts.filter((p): p is string => Boolean(p))));
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
    terms: terms(p.category, ...p.tags, p.slug),
  }));

  const seriesDocs: SearchDoc[] = visibleSeries.map((s) => ({
    type: "series",
    title: s.name,
    href: `/atlas/${s.slug}`,
    group: "Series",
    snippet: snippet(s.description),
    terms: terms(s.slug, s.name),
  }));

  const lessonDocs: SearchDoc[] = visibleSeries.flatMap((s) =>
    s.lessons.map((l) => ({
      type: "lesson" as const,
      title: l.title,
      href: `/atlas/${s.slug}/${l.slug}`,
      group: "Lessons",
      snippet: snippet(l.excerpt),
      meta: s.name,
      terms: terms(s.slug, l.slug, ...l.tags),
    })),
  );

  return [...postDocs, ...seriesDocs, ...lessonDocs];
}
