/**
 * GET /api/search — the site-search document index (ADR-220).
 *
 * WHY A ROUTE: the overlay used to import `@/data/learn` + `@/data/posts`
 * directly, so one static client chunk carried the whole learn dataset —
 * stealth series names AND every lesson body — to every visitor (S2). Options
 * that shipped the index through props or `public/*.json` were rejected: props
 * put the index in 155 prerendered HTML/RSC payloads, and a build-time JSON
 * file couples the content build to a DB that may be absent. A cached route
 * handler ships only what a guest can already browse, on first open.
 *
 * SHAPE: `{ version: 1, docs: SearchDoc[] }` — body-free metadata (title,
 * one-line excerpt, route, tags). Lesson bodies/MDX/quiz content are never
 * read, and the docs are already filtered by the guest-visibility seam, so no
 * stealth series can appear here.
 *
 * CACHING: no cookies/headers/user input anywhere in this path, so the
 * response is prerendered statically and revalidated every 5 minutes. A
 * visibility flip propagates within one window (`revalidate = 300`); a stale
 * document can only ever describe a page that was public a few minutes ago.
 * NEVER `no-store` — this is a public, CDN-cacheable index.
 */
import { NextResponse } from "next/server";
import { getGuestSearchDocs } from "@/lib/learn-visibility";
import type { SearchIndexResponse } from "@/shared/contracts-search";

/** Static: nothing here reads the request. */
export const dynamic = "force-static";

/** Visibility changes propagate within 5 minutes. */
export const revalidate = 300;

/** Public, CDN-cacheable, never no-store. */
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
};

export async function GET(): Promise<Response> {
  const docs = await getGuestSearchDocs();
  const body: SearchIndexResponse = { version: 1, docs };
  return NextResponse.json(body, { headers: CACHE_HEADERS });
}
