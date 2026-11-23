### Site search is measured (search-analytics-event)

**What** - `trackSearch()` in `src/lib/analytics.ts` emits a `search` event with
`search_term` and `result_count`; `SearchOverlay.tsx` calls it once per settled
query (800 ms settle, minimum 2 characters, deduped per mount).

**Why** - GA4's built-in site search reads the query from the URL. The overlay
is client-side only (`src/components/SearchOverlay.tsx` fetches `GET /api/search`
and matches locally), so the URL never carries a term and GA4 enhanced
measurement had nothing to read. Search demand was therefore invisible on both
backends, while it is the clearest signal of what visitors cannot find.

**Verified** - Component tests: one event per settled query, none for a single
character, none twice for the same term. Helper test covers trimming, the
100-character GA4 limit and control-character stripping. Lint, suite and build
run locally.

**Known Issues** - The term is sent as typed, so a visitor who searches for
personal data would report it; there is no allow-list. Terms are capped at 100
characters.