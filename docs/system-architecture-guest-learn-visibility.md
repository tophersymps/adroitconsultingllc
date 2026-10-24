# Guest-visible Learn data — one server seam (ADR-217 … ADR-221)

**Decision record.** Brainiac (web architect), 2026-10-23.
Task: `t_56723521`. Parent: `t_b85134f7` (val-el security audit, verdict FAIL — 2 high, 2 medium).
Base: **`origin/main` @ `01729c75`** (re-verified against it, not the audit's older `0519e470`). No
production code in this change; implementation is Steel's card (see §10).
Absorbs: `origin/fix/sitemap-stealth-guest-visibility-t_018620c9` (commit `80b81876`), which fixed only
the sitemap third of this class.

---

## 1. Context — what is broken, measured

Three public surfaces publish learn data without the DB-driven stealth gate. "Stealth" means a
`courses` row with `status='live'` **and** `access_model='granted'`: `src/lib/access.ts`
(`decideCourseAccessFromInput`, the "stealth-granted (v4)" branch) resolves it to `not-launched` for
anyone without a matching granted entitlement, and `src/app/atlas/[series]/page.tsx:75` turns that
into `notFound()` — a 404 for a guest.

| # | Surface | State on `origin/main` 01729c75 | Severity |
|---|---------|----------------------------------|----------|
| S1 | Post → Learn funnel: `src/components/BlogPost/KeepLearning.tsx:3,30` → `src/lib/funnel.ts:86-96` | **Unchanged.** `CATEGORY_FUNNEL["Project Management"].seriesSlug = "hermes-consultant"`. All **21/21** Project Management post pages prerender the card **and** serialize the 14-field `toLearnCardSeries` projection into the RSC flight payload, including `lessonCount/curriculumLessons = 30` (unreleased curriculum size). | HIGH |
| S2 | Client search bundle: `src/components/SearchOverlay.tsx:5-6,41` (client component mounted site-wide by `src/components/Header.tsx:146,227`) | **Unchanged.** One static chunk (995,007 bytes; `1t29ilbg4scdo.js` on the audited build) referenced by **155/155** post pages contains `hermes-consultant`, `ai-power-user`, `ai-adoption` **and full lesson bodies**. Any guest can download the whole learn dataset plus the stealth names. | HIGH |
| S3 | `src/app/sitemap.ts` | **Half fixed.** `t_0194c233` (commit `6147fe44`) replaced the fail-open `?? new Set(learnSeries…)` fallback with the fail-closed static launch mirror (`isPubliclyLaunchedSeries`). The remaining defect is the healthy path: it selects `status='live'` only and never reads `access_model`, so **96** `hermes-consultant` URLs are still submitted to crawlers, every one a 404 for a guest. | HIGH (SEO + disclosure) |
| S4 | `src/lib/learn-client.ts:8-18` → `src/components/Learn/PathCard.tsx:3` | **Unchanged.** Ships `ai-power-user: "AI Power User"`, `ai-adoption: "AI Adoption"`, … in a client chunk on every page. Labels only, but stealth naming on a public surface. | MEDIUM |

**Root cause is one thing, not four.** Learn *content* (`src/data/learn.ts`, 1,010 lessons) and Learn
*visibility* (`courses.status` / `courses.access_model` in Postgres) are two sources of truth, and
every public surface that reads the first is unaware of the second. The only code that knows both is
`src/lib/access.ts` / `src/lib/catalog.ts`, and it is consulted only on `/atlas/*` routes and the hub.

The class has now recurred three times (sitemap SEO-L1 `t_018620c9`, client search, the funnel — plus
the atlas-route `unavailable` variant `t_c4eafa3b`/`t_0194c233`). This record exists so it does not
recur a fourth time.

Related in-flight work, to be reconciled rather than duplicated:

- `t_b4c0da5f` (Steel, PR #390 open) removes the Project Management → `hermes-consultant` mapping as a
  stopgap. Compatible with this design and subsumed by it: the seam fixes S2/S3/S4 and any *future*
  mapping, and does not depend on the map being empty. If #390 merges first, Steel must not re-add the
  mapping; the funnel test then asserts the unmapped-category case instead.
  This record does **not** endorse deleting the mapping as the fix (see §4).
- `80b81876` / `t_018620c9` — the predicate half is adopted here; the rest is superseded (§6).

---

## 2. Decision in one paragraph

Add one server-only module, `src/lib/learn-visibility.ts`, that answers a single question against the
database — *"which learn series can a logged-out visitor actually resolve?"* — using the canonical
predicate `isGuestVisibleCourse` (single-sourced in `src/lib/access.ts`, ported from `80b81876`). The
seam is `cache()`d, reads through the **anonymous, session-less** Data API client
(`getSupabaseAnonymousClient()` in `src/lib/db/server.ts`, which already exists on `origin/main`), and
**fails closed**: on a DB/token failure it falls back to the app-wide static launched-series mirror
`isPubliclyLaunchedSeries()` — never to "all series", never to a new hardcoded list. Every public
surface — funnel, client search, sitemap — consumes that seam and nothing else. Filtering happens
**before** any value reaches `toLearnCardSeries`, any client component prop, or any module the client
bundle can import. The client search overlay stops importing `@/data/learn` and `@/data/posts`
entirely and gets a stealth-filtered, body-free document index from a new `GET /api/search` route
handler. The `seriesShortLabel` slug→label map leaves `learn-client.ts` and becomes a server-resolved
field on the card projection.

---

## 3. The seam — `src/lib/learn-visibility.ts`

### 3.1 API

```ts
// server-only by construction: imports @/lib/learn (Node fs) + the Data API server client
export interface GuestVisibilityRow {
  series_slug: string;
  status: CourseStatus;
  access_model: AccessModel;
}

/** Pure core (unit-tested without a DB). Empty in ⇒ empty out. */
export function guestVisibleSlugsFromRows(
  rows: readonly GuestVisibilityRow[],
): Set<string>;

/** Slugs a guest can resolve. FAIL-CLOSED to the static launch mirror on failure. */
export function getGuestVisibleSeriesSlugs(): Promise<ReadonlySet<string>>;

/** Content series filtered by the seam, in hub order (`getAllSeries()` order). */
export function getGuestVisibleSeries(): Promise<LearningSeries[]>;

/** Card projection, already filtered — the only shape a component may accept. */
export function getGuestVisibleCardSeries(): Promise<LearnCardSeries[]>;

/** Body-free search documents (posts + visible series + their lessons). */
export function getGuestSearchDocs(): Promise<SearchDoc[]>;
```

Implementation shape:

```ts
import { cache } from "react";
import { getSupabaseAnonymousClient } from "@/lib/db/server";
import { isGuestVisibleCourse } from "@/lib/access";
import { PUBLICLY_LAUNCHED_SERIES } from "@/lib/atlas-launch";
import { getAllSeries } from "@/lib/learn";

type SeamResult = { slugs: ReadonlySet<string>; degraded: boolean };

const loadSeam = cache(async (): Promise<SeamResult> => {
  try {
    const supabase = await getSupabaseAnonymousClient();
    const { data, error } = await supabase
      .from("courses")
      .select("series_slug, status, access_model");   // no .eq("status") — the predicate owns the rule
    if (error) throw error;
    return { slugs: guestVisibleSlugsFromRows(data ?? []), degraded: false };
  } catch (err) {
    warnOnce("[learn-visibility] courses read failed — degrading to the static launch mirror", err);
    return { slugs: new Set(PUBLICLY_LAUNCHED_SERIES), degraded: true };
  }
});
```

`getGuestVisibleSeries()` = `getAllSeries().filter((s) => slugs.has(s.slug))`; it keeps the existing
newest-activity ordering so the funnel card and the hub card stay identical.

`degraded` is exposed for logging/telemetry only. It is **not** a licence to widen the set.

### 3.2 Why the anonymous client, and why not the cookie-bound one

- **Correctness.** `courses_select_live_or_admin`
  (`supabase/migrations/008_course_catalog.sql:139-142`, mirrored at `neon/001_rls.sql:416-419`) is
  `using (status = 'live' or public.is_admin())`, so the anonymous key reads every live row —
  including stealth ones. The predicate removes them. RLS is the transport, not the gate.
- **Least privilege.** No `SUPABASE_SERVICE_ROLE_KEY` in the request path; the sitemap already moved
  off the service client for exactly this reason.
- **Static rendering.** `getSupabaseServerClient()` reads `cookies()`; calling it from
  `KeepLearning` would opt all 155 post pages into dynamic rendering and kill their prerender. The
  anonymous client touches no request API, so pages stay static/ISR and the failure mode is "no
  funnel block", not "no page".
- **Already available.** `getSupabaseAnonymousClient(): Promise<DbClient>` exists at
  `src/lib/db/server.ts:416` on `origin/main` (it returns the degraded client under a token outage,
  and the read then fails — exactly the path the seam's fail-closed branch handles).

### 3.3 Fail-closed policy — reuse the existing launch mirror

On a DB/token failure the seam falls back to `PUBLICLY_LAUNCHED_SERIES`
(`src/lib/atlas-launch.ts`: `agentic-ai`, `ai-at-work`, `omni-studio-cert`, `salesforce-architect`).

This is deliberate, not a hedge:

- It is the **already-ratified degraded contract** (`t_0194c233` option 1, F-2 CWE-200), used by every
  `/atlas/*` route on its `unavailable` path and by the sitemap today. One contract across all
  surfaces means the funnel can never link to a series whose atlas page 404s during the same outage.
- It is an **allowlist**, i.e. fail-closed — not a denylist and not "all series".
- It is **not a new stealth list**: one existing constant, parity-tested against the 008 seed
  migration by `src/lib/atlas-launch.test.ts`. One assertion is added (§10 step 2b): every mirror
  slug is `access_model != 'granted'` in the seed.

**Rejected:** empty set. Safe, but it contradicts `atlas-launch.ts`'s explicit "fail closed ON
CONTENT, degrade only ON AVAILABILITY" rule and would delete the funnel/search for the four free
series during every token hiccup, with no security gain.
**Rejected:** the old `?? new Set(learnSeries.map(…))` fallback — fail-open, already removed.
**Rejected:** a *new* free-slug list inside the seam — a second stealth list, the thing this record
forbids.

Per-surface degraded behaviour (identical set everywhere): funnel renders only free-category cards;
search keeps posts + the four launched series; sitemap emits exactly the mirror's learn URLs.

### 3.4 `cache()` semantics (state the limit honestly)

`cache()` from `react` memoises **per render/request**. During `next build` each of the 155 post pages
is its own render, so this is up to 155 small queries (one indexed `select` of ≤12 rows). With ISR
each page revalidation repeats it. That is the cost of DB-authoritative visibility on a static page
and it is acceptable: the query is tiny, and a failure degrades one page, not the build. Do **not**
reach for `unstable_cache` here — it introduces a cross-request cache and a staleness window on a
security predicate.

### 3.5 Server-only enforcement

The repo does not depend on the `server-only` package (absent from `node_modules`), so the guard is
structural, matching the existing `learn.ts` / `learn-client.ts` split: the seam imports `@/lib/learn`,
which imports `fs`/`path`. Any client component importing the seam fails the build with an
unresolvable Node builtin. Add `import "server-only"` only if the package is added as an explicit
dependency — Steel must not assume it resolves. A regression test (§10 step 21) scans for `"use
client"` modules importing the seam or the raw datasets.

---

## 4. Funnel — `KeepLearning` stops importing the dataset

`src/lib/funnel.ts` stays pure and unchanged in signature:

```ts
resolveRecommendedSeries(post: BlogPost, seriesList: LearningSeries[])
```

The fix is at the call site:

```ts
// KeepLearning.tsx  (server component)
const visibleSeries = await getGuestVisibleSeries();      // seam, never @/data/learn
const rec = resolveRecommendedSeries(post, visibleSeries);
```

Because the seam already dropped `hermes-consultant`, `resolveRecommendedSeries` returns `undefined`
for Project Management posts and the component's existing `rec &&` guard (`KeepLearning.tsx:35`)
renders nothing. No stealth slug, name, description or lesson count ever enters `toLearnCardSeries`
or the RSC payload.

**Rejected:** filtering inside `KeepLearning` or `funnel.ts` — still needs the DB read, hardcodes
stealth knowledge into a blog component, and leaves the dataset available to the next consumer.
**Rejected as the *fix*:** deleting the `CATEGORY_FUNNEL["Project Management"]` entry (what `t_b4c0da5f`
does as a stopgap). It silences one mapping while leaving the class open and makes the map lie about
product intent; category → series stays content policy, visibility stays DB policy. If that PR lands,
fine — the seam still ships.

---

## 5. Client search — route handler, not props

### 5.1 Options

| Option | Ships to client | Latency on first keystroke | Verdict |
|---|---|---|---|
| A. Keep dataset in the bundle, filter client-side | Full dataset (can't filter what you ship) | instant | **rejected** — this is the vulnerability |
| B. Server component props (`Header` → `SearchOverlay`) | The index JSON in **every** page's RSC payload + prerendered HTML (155 pages) | instant | **rejected** — more total transfer than today, and it lands in static HTML |
| C. Build-time JSON in `public/` | filtered JSON (downloadable, fine) | instant | **rejected** — couples content build to a DB that may be absent, plus a stale-file leak window |
| D. **`GET /api/search` document index**, matched client-side | only filtered, body-free docs, on first open | one CDN-cached fetch (~40 KB gzip) | **chosen** |
| E. Per-query `GET /api/search?q=` | nothing but hits | one request per debounced keystroke | rejected — worse UX, more server work, no benefit over D |

### 5.2 The route

`src/app/api/search/route.ts`

```ts
export const dynamic = "force-static";   // no cookies/headers read anywhere in this path
export const revalidate = 300;           // visibility changes propagate within 5 min

export async function GET() {
  const docs = await getGuestSearchDocs();       // seam — filtered, server-only
  return Response.json({ version: 1, docs });
}
```

- **No auth, no cookies, no user input** → safe to prerender as static JSON with ISR. A visibility
  flip is reflected within one revalidation window. If Steel prefers immediate effect, keep the
  handler dynamic with `Cache-Control: public, s-maxage=300, stale-while-revalidate=1800`. **Never**
  `no-store`.
- **Payload budget.** posts (public content) + ≤9 visible series + their lessons as
  `{title, excerpt, slug, series, tags}` — **no lesson bodies, no MDX/section content**. Budget
  < 200 KB raw / < 50 KB gzip; assert it in the route test.
- **What a guest can download here is exactly what a guest can already browse.** The index is a cache
  of public pages, not a privilege escalation.

### 5.3 The client

`src/components/SearchOverlay.tsx`

- Delete `import { posts } from "@/data/posts"` and `import { learnSeries, learnLessons } from "@/data/learn"`.
- Fetch once, lazily, on first open (`open && !docs`), module-scoped cache with a short TTL so a second
  open is free; `AbortController` on unmount.
- Keep the type-ahead UX by moving `normalize`/`matches` (`src/lib/search.ts`) to operate on
  `SearchDoc[]`: `searchDocs(docs, query): SearchResults`. No network per keystroke.
- A11y contract preserved and extended: the existing `role="status" aria-live="polite"` region
  announces "Loading search…" and "Search is unavailable — try again" as well as the result count; on
  failure the overlay stays usable (input + message), never a blank panel.
- Types in a new `src/shared/contracts-search.ts` (`SearchDoc`, `SearchResults`), imported by both the
  route and the overlay — the repo's contracts pattern.

### 5.4 `src/lib/search.ts`

Becomes a pure, dataset-agnostic module: `searchDocs(docs, query)`. Its header comment ("both datasets
are static imports") is what produced S2 — delete that claim with the imports.

---

## 6. Sitemap — consume the seam, delete the local query *and* the local fallback

`src/app/sitemap.ts` deletes:

- the inline `getSupabaseAnonymousClient()` dynamic import and `status='live'` query,
- the `isPubliclyLaunchedSeries` fallback block and its `console.warn` — that logic moves into the
  seam so all three surfaces share it,
- the `isLive` / `visibleSeries` / `visibleLesson` helpers in favour of the seam's set,

and uses `const slugs = await getGuestVisibleSeriesSlugs();`.

**Sequencing with `80b81876` (pending branch `fix/sitemap-stealth-guest-visibility-t_018620c9`):**
that branch is not on `main` and cannot merge as-is — it targets an older tree layout. Its valuable
half is the predicate; port exactly that:

- `isGuestVisibleCourse(course: Pick<CourseRow,"status"|"access_model">)` into `src/lib/access.ts`
  next to `decideCourseAccessFromInput`, with its docstring (it is the non-admin, no-entitlement path
  expressed as a pure check),
- its unit test into `src/lib/access.test.ts`.

Its `sitemap.ts` hunk and `sitemap.test.ts` are superseded by §10 steps 8-9. **Decision:** this card's
implementation supersedes `t_018620c9`; close it as superseded when Steel's branch lands and name both
in the CHANGELOG.

**Existing tests that must stay green:** `src/app/sitemap.degraded.test.ts` already asserts (a) the
sitemap survives a token 429, (b) it degrades to the launch mirror with **zero** stealth URLs, and
(c) the degradation is warned exactly once. After the move the warning originates in the seam; keep
one warn per render and update that test's `sitemapWarns` message filter deliberately rather than
deleting the assertion.

---

## 7. Where `seriesShortLabel` lives after this change

The map is duplicated today: `src/lib/learn.ts:250` has 4 slugs (server), `src/lib/learn-client.ts:8-18`
has 9 (client, shipping stealth labels). A label is display data derived from a slug — the class
ADR-207 moved into the projection — so:

1. Add `shortLabel?: string` to `LearnCardSeries` (`src/data/types.ts:90`).
2. Keep the slug→label map in the **server** module `src/lib/learn.ts` (naming a stealth slug there is
   harmless; such a series never reaches a guest projection) and expose `seriesShortLabel(slug)`.
3. `toLearnCardSeries` (`src/lib/learn.ts:48`) and `toLearnHubCards` (`src/lib/catalog.ts:196`) set
   `shortLabel`.
4. `src/components/Learn/PathCard.tsx:3` stops importing `@/lib/learn-client` and renders
   `{series.shortLabel ?? humanizeSeriesSlug(series.slug)}`.
5. `src/lib/learn-client.ts` loses the map; keep only the pure `humanizeSeriesSlug(slug)` fallback, or
   delete the module if nothing imports it after step 4 (PathCard is its only importer today).

Result: no client chunk contains a stealth series label, and there is one label map, not two.

---

## 8. Diagram

```mermaid
flowchart TD
  subgraph DB["Postgres (courses)"]
    C[("courses: series_slug, status, access_model")]
  end

  subgraph SEAM["src/lib/learn-visibility.ts (server-only)"]
    L["loadSeam() — cache(), anonymous Data API client"]
    P["isGuestVisibleCourse() — src/lib/access.ts"]
    D["fallback: isPubliclyLaunchedSeries() — atlas-launch.ts"]
    S["getGuestVisibleSeriesSlugs / Series / CardSeries / SearchDocs"]
    L --> P --> S
    L -.->|"on DB/token failure"| D --> S
  end

  C -->|"select (RLS: live or admin)"| L

  S --> K["KeepLearning (RSC)"]
  K --> F["resolveRecommendedSeries(post, visibleSeries)"]
  F --> PC["PathCard + toLearnCardSeries"]

  S --> A["/api/search (force-static, revalidate 300)"]
  A -->|"filtered SearchDoc[]"| SO["SearchOverlay (client)"]
  SO --> M["searchDocs(docs, query) — local match"]

  S --> SM["src/app/sitemap.ts"]

  X["src/data/learn.ts (content, 1,010 lessons)"]
  X -.->|"filtered by seam"| S
  X -.X. "NO direct import from any public surface or client module"
```

---

## 9. ADRs

- **ADR-217 — One guest-visibility seam for learn data.** All public surfaces that read learn content (post funnel, client search, sitemap) resolve visibility through `src/lib/learn-visibility.ts`; no surface filters on its own. Context: three recurrences of the same leak class because content and DB visibility are separate sources of truth. Consequence: one query + one predicate to audit; a new public surface gets the gate by construction, and any surface importing `@/data/learn` directly is a review defect.
- **ADR-218 — The predicate is `isGuestVisibleCourse`, single-sourced in `access.ts`.** `status === "live" && access_model !== "granted"`, exported next to `decideCourseAccessFromInput` and parity-tested against it. Consequence: no second stealth list, no new allowlist, no per-surface copy; changing who can see a live course changes every surface at once.
- **ADR-219 — Guest learn visibility fails CLOSED, and its closed state is the existing launch mirror.** Any DB/token failure yields `PUBLICLY_LAUNCHED_SERIES` (via `isPubliclyLaunchedSeries`), never "all series". Consequence: an outage costs funnel impressions and sitemap learn URLs, never a disclosure, and the funnel can never link to a series the degraded atlas route 404s.
- **ADR-220 — The client receives learn data only as a filtered, body-free projection served by a route handler.** `GET /api/search` returns post + visible-series + lesson metadata docs; components never receive the dataset as props and never import it. Consequence: the site-wide 995 KB chunk is deleted; the index is CDN-cached with a ≤5 min visibility window; a new searchable surface must go through the seam too.
- **ADR-221 — Display labels are part of the card projection, not a client constant.** `LearnCardSeries.shortLabel` is resolved server-side from the single map in `src/lib/learn.ts`; `learn-client.ts` keeps only the pure humanizer. Consequence: stealth names cannot reappear in a chunk; adding a course no longer means editing a client file.

---

## 10. File-level change list for Steel

Branch `fix/guest-learn-seam-t_4b6e3daa` off the ADR branch (which is off `origin/main` `01729c75`).
Order matters: steps 1-5 give the seam and make it testable before any surface moves.

**P0 — predicate + seam**

1. `src/lib/access.ts` — add `isGuestVisibleCourse(course: Pick<CourseRow,"status"|"access_model">): boolean` (docstring ported from `80b81876`); no other change.
2. `src/lib/access.test.ts` — parity tests: live+granted → false; live+free / subscription / one-time / sub-or-one-time → true; pending+granted → false; pending+free → false; archived → false; plus parity with `decideCourseAccessFromInput({isAdmin:false,entitlements:[],subscriptions:[]})` across that matrix.
2b. `src/lib/atlas-launch.test.ts` — add one assertion: every `PUBLICLY_LAUNCHED_SERIES` slug is seeded in `008_course_catalog.sql` with `access_model != 'granted'` (the degraded fallback must never name a stealth series).
3. *(verify, don't build)* `getSupabaseAnonymousClient()` already exists at `src/lib/db/server.ts:416`; use it. Do not add a second anon client, do not import `src/lib/supabase/*` (gone on this base), do not use the service-role key.
4. `src/lib/learn-visibility.ts` — **new**. `guestVisibleSlugsFromRows` (pure), `loadSeam` (`cache()`), `getGuestVisibleSeriesSlugs`, `getGuestVisibleSeries`, `getGuestVisibleCardSeries`, `getGuestSearchDocs`, warn-once degradation to `PUBLICLY_LAUNCHED_SERIES`.
5. `src/lib/learn-visibility.test.ts` — **new**. Pure filter cases; loader-throws → exactly the mirror set (`degraded: true`) and **assert the result is not `learnSeries.length`** (fail-closed regression guard); `getGuestVisibleSeries()` preserves hub order and drops stealth.

**P0 — funnel (S1)**

6. `src/components/BlogPost/KeepLearning.tsx` — remove `import { learnSeries } from "@/data/learn"`; `const visibleSeries = await getGuestVisibleSeries();`; pass to `resolveRecommendedSeries`. Keep `toLearnCardSeries(rec.series)` and the `rec &&` guard.
7. `src/components/BlogPost/KeepLearning.test.tsx` — **new**. (a) Project Management post with `hermes-consultant` filtered out → no "Keep learning" label, no `/atlas/hermes-consultant` in the tree; (b) Salesforce post → PathCard with `/atlas/salesforce-architect`; (c) related-posts row still renders when the funnel is empty. If `t_b4c0da5f` merged first and the mapping is gone, assert the unmapped-category case instead.

**P0 — sitemap (S3)**

8. `src/app/sitemap.ts` — replace the query **and** the mirror fallback with `await getGuestVisibleSeriesSlugs()`; drop the `@/lib/db/server` and `@/lib/atlas-launch` imports; update the docstring (it currently documents the local degradation).
9. `src/app/sitemap.test.ts` — **new**: no stealth `<loc>` on the healthy path; all URLs of every guest-visible series present; healthy-path fixture must include a live+granted row that the seam drops.
   `src/app/sitemap.degraded.test.ts` — **keep green**: update only the warn-message filter if the message moved into the seam; the mirror + zero-stealth assertions stay.

**P0 — client search (S2)**

10. `src/shared/contracts-search.ts` — **new**. `SearchDoc`, `SearchResults`.
11. `src/lib/search-docs.ts` — **new** (server-only). `buildSearchDocs()`: posts (public) + `getGuestVisibleSeries()` + their lessons as `{title, excerpt, slug, series, tags}` — strip bodies and any `section`/`content` fields.
12. `src/lib/search.ts` — refactor to `searchDocs(docs, query)`; drop the dataset arguments and the "both datasets are static imports" comment; keep grouping/limits/normalize behaviour identical.
13. `src/lib/search.test.ts` — update to the docs shape; keep the existing matching assertions.
14. `src/app/api/search/route.ts` + `route.test.ts` — **new**. `dynamic="force-static"`, `revalidate=300`; returns `{version, docs}`; test asserts no `hermes-consultant` / `ai-power-user` / lesson-body strings in the JSON and raw size < 200 KB.
15. `src/components/SearchOverlay.tsx` — remove both data imports; lazy fetch on first open with abort + memory cache; loading/error states in the existing `role="status"` region; match locally via `searchDocs`.
16. `src/components/SearchOverlay.test.tsx` — rewrite the `vi.mock` block: mock `fetch` (not the datasets) with a docs fixture; keep **every** existing `t_754b2240` a11y assertion; add loading + fetch-failure cases.

**P1 — labels (S4)**

17. `src/data/types.ts` — add `shortLabel?: string` to `LearnCardSeries`.
18. `src/lib/learn.ts` — consolidate the slug→label map here (single map, may include stealth slugs); set `shortLabel` in `toLearnCardSeries`.
19. `src/lib/catalog.ts` — set `shortLabel` in `toLearnHubCards` (same helper).
20. `src/components/Learn/PathCard.tsx` — render `series.shortLabel ?? humanizeSeriesSlug(series.slug)`; drop the `@/lib/learn-client` import. `src/lib/learn-client.ts` — delete the map; keep only the humanizer (delete the module if unused).

**P1 — guards + docs**

21. `src/lib/client-data-imports.test.ts` — **new**. Walk `src/`, fail if any file containing `"use client"` imports `@/data/learn`, `@/data/posts`, `@/lib/learn-visibility`, or `@/lib/search-docs`. Allowlist must be empty.
22. `CHANGELOG.md` — one entry naming S1-S4, this record, and the supersession of `t_018620c9`.

**Out of scope (do not touch in this card)**

- `src/lib/sky-server.ts` hardcoded series list — signed-in-only, server-only surface; separate cleanup.
- `src/app/atlas/*` route gating — verified correct (and already uses the launch mirror on `unavailable`).
- `src/lib/funnel.ts`'s `CATEGORY_FUNNEL` content.

---

## 11. Acceptance criteria (testable)

**Built-output assertions** (in the adroit repo, after `npm run build`):

```sh
grep -rl "Hermes Agent Consultant" .next/server/app/field-notes/*.html | wc -l   # 21 → 0
grep -rl 'hermes-consultant' .next/server/app/field-notes/*.rsc | wc -l         # 21 → 0
grep -rl "AI Power User\|AI Adoption" .next/static/ | wc -l                     # 3 → 0
grep -c "hermes-consultant" .next/server/app/sitemap.xml.body                   # 96 → 0
grep -rl "learnSeries" .next/static/chunks/*.js | wc -l                         # 0
```

**Behavioural**

1. A guest on any of the 21 Project Management posts sees no funnel block; page source contains no stealth slug, name, description or lesson count.
2. A guest on a Salesforce / AI & Consulting / React & Web Dev / UI/UX post still sees its mapped-series card (the gate must not over-filter; skip if `t_b4c0da5f` removed the mapping).
3. `/sitemap.xml` emits no URL for a stealth or non-live series and still emits every URL of every guest-visible series. On a token-429 (`sitemap.degraded.test.ts` harness) it emits exactly the four launch-mirror series, zero stealth, one warn — unchanged from today.
4. `/api/search` returns no stealth slug/name/description and no lesson body; the response is CDN-cacheable (static or `s-maxage`), never `no-store`.
5. No client chunk contains the learn dataset: no `@/data/learn` / `@/data/posts` imports from `"use client"` modules; the overlay is fully usable (loading, results, no-results, error) and its `t_754b2240` a11y tests still pass.
6. `PathCard` renders the server-resolved `shortLabel` on the hub, and no client chunk contains `"AI Power User"` / `"AI Adoption"` / `"Sharing & Visibility"`.
7. `npm test`, `npx tsc --noEmit`, `npm run build` clean; new tests cover the pure filter, the fail-closed path, the funnel gate, the sitemap healthy path, and the route payload.
8. Post pages remain statically prerendered (not dynamic) — the seam must not introduce `cookies()`/`headers()` into that render.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| A DB read at prerender adds a build dependency (155 queries; the DB must answer at build) | Anonymous session-less client, `cache()` per render, fail-closed to the launch mirror; a build never fails. Verify no page flips to dynamic (AC 8). |
| The launch mirror could go stale if a new series launches without updating it | `atlas-launch.test.ts` already parity-tests it against the 008 seed; step 2b adds the granted check. Staleness only affects the outage path. |
| Stealth set is broader than the 3 hermes series (content-only series with no `courses` row also 404) | Those are excluded automatically: the seam is a positive allowlist (`slugs.has`), not a denylist. Never invert it. |
| `revalidate = 300` leaves a ≤5 min search-index staleness after a visibility flip | Accepted for search; sitemap regenerates per build; the funnel reads per render. Make the route dynamic with `s-maxage=300` if the owner wants zero window. |
| `shortLabel` contract change touches every card producer | Only the two builder functions (steps 18-19); the field is optional so existing fixtures still typecheck. |
| Conflict with `t_b4c0da5f` (funnel mapping), `t_018620c9` (predicate), or in-flight Constellations work | Rebase on `origin/main`; this change owns `sitemap.ts` and `access.ts` thereafter; `sky-server.ts` untouched. |
| Moving the fallback into the seam breaks `sitemap.degraded.test.ts` | Expected and specified (step 9): keep the mirror + zero-stealth assertions, adapt only the warn filter. |

## 13. Open questions (none blocking)

1. Search index freshness of 5 min — acceptable, or prefer a dynamic route with a 5 min CDN `s-maxage`? (Recommendation: accept `force-static` + 300 s.)
2. Fold `src/lib/sky-server.ts`'s hardcoded series list into the seam in a follow-up card? (Recommendation: yes, separate card.)
