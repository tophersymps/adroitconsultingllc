### Cut Fluid Active CPU: cache /field-notes and disallow AI crawlers (t_dc2f7d85)

**What** - Two changes, one PR.

1. `src/app/field-notes/page.tsx` no longer reads the `searchParams` prop, so the blog index is
   prerendered (`export const dynamic = "force-static"`) with ISR (`revalidate = 3600`) instead of
   server-rendered on every request. The interactive filter island
   (`src/components/BlogListing/BlogListingClient.tsx`) reads a deep-linked `?category=` / `?read=` /
   `?sort=` view from the live URL through `useSyncExternalStore` (empty server snapshot, so the
   prerendered markup is unchanged and hydration cannot mismatch), and its handlers now write one
   accumulating query string instead of one that drops the previously chosen filter.
2. `src/app/robots.ts` adds a named disallow group for AI and bulk-scraper user agents (GPTBot,
   ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-Web, anthropic-ai, Google-Extended,
   Applebot-Extended, CCBot, Bytespider, Amazonbot, Meta-ExternalAgent, FacebookBot, Diffbot,
   ImagesiftBot, YouBot, cohere-ai, PerplexityBot, Perplexity-User). The `*` group keeps `allow: /`
   and the existing `/api/`, `/preview/`, `/admin/`, `/lab/` disallow list.

**Why** - The adroit-consulting Hobby team was at 3h 38m of its 4h/month Fluid Active CPU allowance
(90.8%) on 2026-11-15 and cannot buy overage: crossing 100% pauses the deployment. Measured crawler
traffic was 4.8-5.0 function requests/min (~207k/month), including six concurrent renders of
`/field-notes` inside two seconds, against a 554-URL sitemap that grows with every publish.
`/field-notes` rendered per request only because the page awaited `searchParams`; robots.txt invited
every AI scraper to re-walk the whole sitemap.

**Verified** - `npm run build`: `/field-notes` is now `○ (Static) 1h 1y` (it was dynamic) and
`/robots.txt` stays static; only `src/app/field-notes/page.tsx` changed rendering mode and no other
`force-dynamic` marker was touched. The prerendered file `.next/server/app/field-notes.html` contains
the hero, the featured post and the first 8 post cards. Against `next start`, `curl /field-notes`
twice returns `x-nextjs-cache: HIT` with `Cache-Control: s-maxage=3600, stale-while-revalidate=...`
(the header Vercel's CDN turns into `x-vercel-cache: HIT` with an incrementing `age`), a
`?category=react` request returns the same prerendered bytes, and `/robots.txt` serves the AI groups
above. `vitest run`: 1878 passed, 1 failed, and that one failure
(`src/app/api/search/route.test.ts`, payload budget 201416 > 200000) also fails on `main` and is
unrelated to this change.

**Known Issues** - A filtered deep link (`?category=` etc.) now receives the same prerendered
unfiltered first page and applies the filter once hydrated, instead of being server-rendered filtered.
Filtered URLs are not in `sitemap.xml` and are not canonical. robots.txt binds only compliant
crawlers and takes effect on their next fetch; the immediate block is the Cloudflare bot rule Chris
owns.
