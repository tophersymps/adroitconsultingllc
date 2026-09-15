# Brainiac — Technical / Perf / SEO / Analytics Discovery (adroit-blog)

**Date:** 2026-09-01 · **Tenant:** adroit-blog · **Scope:** Discovery/audit only — no implementation
**Repo:** `~/Documents/Fortress-of-Solitude/adroit-blog` · **Staging live:** `https://adroit-blog-two.vercel.app` · **Canonical target:** `https://adroit.io`
**Stack:** Next.js 16.3.0 (App Router, Turbopack) · React 19.2.4 · TypeScript · Tailwind v4 · Supabase (Postgres + Auth) · MDX (next-mdx-remote) · Vitest

---

## Executive summary

The site is in **strong technical health**: production build compiles clean (410 static pages, **no warnings/errors**), **384 unit tests pass** across 59 files, **`npm audit` reports 0 vulnerabilities**, and the security-header/CSP posture is excellent (nosniff, DENY framing, HSTS, conservative CSP). SEO foundations — sitemap, robots, canonicals, OG/Twitter meta, JSON-LD on Learn, RSS feed — are all present and thoughtful.

The **highest-impact gaps are not code-quality issues** but three strategic holes: **(1) zero web analytics** (the site cannot measure anything), **(2) a canonical-domain launch mismatch** (every canonical/sitemap/OG URL targets `adroit.io`, which today serves a *different* corporate app and 404s those routes), and **(3) the /blog index renders as a client-only shell** (no content in the SSR HTML). The **Constellations/V2 achievement foundation is partially ready** but has specific data gaps (quiz/exam/cert not in the event log, no rank field, an unused `now` param that makes the "current streak" subtly wrong).

Findings are ranked by impact. Each includes evidence, why it matters, a proposed fix, and effort (S/M/L).

---

## HIGH impact

### 1. Zero web analytics — the site is unmeasurable
- **Evidence:** No GA4 (`G-*`), gtag, Plausible, Umami, Fathom, or `@vercel/analytics` anywhere in `package.json`, `src/`, `next.config.ts`, or `proxy.ts`. The only "analytics" in the repo is `src/lib/course-analytics.ts` — an **admin** per-course completion aggregate (reads `lesson_completion` + `read_progress`), not web analytics. `npm audit` / grep confirm no tracking script is injected in `layout.tsx`.
- **Why it matters:** A content site with 63 posts + 109 lessons, per-lesson progress, quiz tiers, exams, and certificates has **no way to measure** traffic, which content converts, learn-funnel drop-off, or organic growth. Any growth/SEO decision is guesswork.
- **Proposed fix:** Wire a privacy-friendly, low-footprint analytics consistent with the static-first stack. Two solid options:
  - **Vercel Web Analytics** (`@vercel/analytics`) — first-party, ~1KB, zero-extra backend, works with the existing Vercel deploy. Requires adding `https://vercel.live/_vercel/insights` to `connect-src` in the CSP.
  - **Plausible** (privacy-first, self-host or cloud) — single script, cookie-less, GDPR-friendly. Requires adding `https://plausible.io` to both `script-src` and `connect-src` in the CSP (`next.config.ts` headers).
  - Also consider custom events for the **progress funnel** (lesson complete, quiz tier passed, exam passed, cert earned) — these align with Constellations and give real product analytics.
- **Effort:** S (one dependency + a small CSP `connect-src`/`script-src` edit). Recommend as a follow-up implementation task for Steel.

### 2. Canonical/sitemap/OG all target `adroit.io`, which 404s those routes today (launch blocker)
- **Evidence:** `siteConfig.url = "https://adroit.io"` (`src/lib/seo.ts:12`). Every canonical (`link rel=canonical href=https://adroit.io/...`), every sitemap URL, every `og:image` and the robots `Sitemap:` all use `adroit.io`. Live check: `https://adroit.io/blog` → **404** and `https://adroit.io/og-blog-card.png` → **404**. The `adroit.io` root is a **completely different Next.js app** — the corporate marketing site (carmine/navy/charcoal hero, `/contact`, `/platform-strategy`, `/operational-intelligence`, `/digital-experience`; no `/blog`). README confirms: *"The production domain `adroit.io/blog` is intentionally not wired until launch."*
- **Why it matters:** Pre-launch this is defensible (you don't want staging indexed), but it is the **#1 launch-readiness item**: the moment the site is promoted, `adroit.io/blog` (and `/learn`, `/tags`, all 63 posts, 109 lessons) must serve this app — and `/og-blog-card.png` must resolve — or every canonical/sitemap URL points at 404s and Google cannot index a single page. Also, the staging deployment is currently **self-deindexing by design**: if a crawler hits `adroit-blog-two.vercel.app/*`, the canonical tells it the real URL is `adroit.io/*`, which 404s.
- **Proposed fix:** At launch: (a) wire `adroit.io/blog/**` (path-preserving) to this app — ideally the corporate site 301s `/blog*` → the blog app, or the blog owns `/blog/**` on the shared domain; (b) verify `/og-blog-card.png`, `/sitemap.xml`, `/robots.txt`, `/feed.xml` resolve on `adroit.io`; (c) re-point the corporate root site to link to `/blog`. Confirm no double-indexing between the two apps on shared paths.
- **Effort:** S–M (DNS/route config at launch; no code change required — code is already correct for the target domain).

### 3. `/blog` index is a client-only shell — no content in the SSR HTML
- **Evidence:** `src/app/blog/page.tsx` is `"use client"`. Live `GET /blog` HTML (20.6 KB) contains **zero post titles/body** (grep for a real post title → 0 matches); the entire 63-post listing renders from JS after hydration. Build marks `/blog` `○ Static`, but the prerender is an empty shell + RSC payload. Individual `/blog/[slug]` pages ARE SSG (`●`, full article HTML present).
- **Why it matters:** The blog index is the highest-traffic landing page. A client-only shell hurts **LCP / INP / Core Web Vitals**, is fragile for users without JS, and under-renders for SEO crawlers that execute JS partially. It also ships all 63 posts (48 KB `src/data/posts.ts`) into the client bundle.
- **Proposed fix:** Server-render the first page of post cards (SSG the markup); keep category-filter/sort/pagination as a small client island on top. This keeps the snappy filter UX while making content present in the initial HTML. Alternative: emit the card list into the RSC payload (it is content-derived and cacheable).
- **Effort:** M.

---

## MEDIUM impact

### 4. Learn pages are `force-dynamic` + a per-request Supabase auth check in the proxy → every page pays DB round-trips
- **Evidence:** All Learn pages (`/learn`, `/learn/[series]`, `/learn/[series]/[slug]`, exam, check, certificate) are `force-dynamic` (`src/app/learn/[series]/[slug]/page.tsx:36`) because they run the per-user paywall gate (`accessSeam.decideCourseAccess`, `supabase.auth.getUser()`). Additionally `src/proxy.ts` runs `supabase.auth.getUser()` on **every navigation** (all routes except static assets and `/api`), refreshing session cookies before any page renders.
- **Why it matters:** 109 lessons + 7 series render on-demand (not SSG/ISR), so Learn content is **not CDN-cacheable** and each visit incurs Supabase auth + course-row round-trips → higher TTFB and more Supabase load. The proxy auth check also applies to purely static pages (blog), adding latency to every page load.
- **Proposed fix (split, tradeoff-aware):**
  - **Public/non-gated lessons** can be SSG/ISR'd; keep the per-user gate **client-side** (fetch the access decision client-side) so page HTML is cacheable. Gated (paywalled) lessons stay dynamic.
  - In `proxy.ts`, short-circuit: if no Supabase session cookie is present, skip `auth.getUser()` (unauthenticated visitors are the common case on a blog and don't need a refresh round-trip).
- **Effort:** M.

### 5. Constellations data-readiness gaps
- **Evidence / analysis** (from `src/lib/completion.ts`, `supabase/migrations/009_learn_catalog.sql:127`, `src/shared/contracts-course-catalog.ts:396`, and write sites):
  - `completion_events.event_type` is `CHECK (event_type in ('lesson','course'))` — **no quiz / exam / certificate event types**, and **no metadata column**.
  - `appendCompletionEvent` is called **only** from `src/app/api/progress/lesson/route.ts` (lesson + auto course completion). **Quiz progress lives in `quiz_attempts`/`quiz_runs`; certificates are derived on-demand from exam runs** (`src/lib/certificate.ts`) and blog reads live in a separate `read_progress` table. None write to `completion_events`.
  - `DerivedProgress` exposes `lessonsCompleted, coursesCompleted, tracksCompleted, streakDays, longestStreakDays, timeToCompleteDays` — but **no `rank` field** (the "rank ladder" is only mentioned in code comments/docstrings, not implemented).
  - **`now` is accepted by `CompletionInput` but never used** in `deriveProgress` — the "current streak" is computed as *the consecutive run ending at the most recent completion day*, not *relative to today*. So if a user's last completion was 5 days ago, `streakDays` reports the old run length (e.g. 7) rather than 0. Tests pass only because fixtures set the last event on the `now` date.
- **Why it matters:** A Constellations/Chronicle achievement visual keyed on quiz mastery, exam passes, certificates, or "reader" activity **cannot be derived from `deriveProgress()` alone** — those signals aren't in `completion_events`. And any streak-based constellation will compute stale streaks due to the unused `now`.
- **Proposed fix (when Constellations is specced):**
  - **Migration:** widen `event_type` CHECK to include `'quiz'`, `'exam'`, `'certificate'` (+ optionally a `metadata jsonb` for tier/score). Low risk — additive.
  - **New write sites:** emit `completion_events` from the quiz-run and exam-pass handlers and the certificate-eligibility path.
  - **Fix the streak bug:** use the injected `now` to compute the live current streak (0 if the last completion is not today/yesterday) — add a test with last-event < `now`.
  - **Add a `rank` derivation** (e.g. from `coursesCompleted`/`lessonsCompleted` bands) if the ladder is a goal.
- **Effort:** M (schema migration + 3 write sites + rank + streak fix). This should be its own implementation task when Constellations is prioritized.

### 6. Sitemap `lastmod` is `new Date()` for static/hub pages → churn on every deploy
- **Evidence:** `src/app/sitemap.ts` sets `lastModified: new Date()` for the root, `/blog`, `/blog/categories`, tags, `/learn`, series, and check/exam pages. Live `sitemap.xml` shows `2026-09-01T00:30:13Z` (a build timestamp) for these.
- **Why it matters:** Every deploy rewrites `lastmod` for pages that didn't change → unnecessary re-crawl churn and diluted crawl signals.
- **Proposed fix:** Use stable content-derived dates (blog posts already use `post.date`; series use lesson dates). For hub pages with no natural date, omit `lastmod` (Google ignores it) or pin a static value.
- **Effort:** S.

---

## LOW impact

### 7. All posts share one generic OG image; per-post banners aren't reused for social
- **Evidence:** `buildMetadata` defaults to `siteConfig.defaultOgImage = "/og-blog-card.png"` for every post. Posts have `bannerImage` (rendered in-article via `BannerImage`) but it's **not** used as `og:image`. Note the og:image URL is `https://adroit.io/og-blog-card.png` which currently **404s** (see #2).
- **Why it matters:** Uniform social cards lower click-through on LinkedIn/Twitter/FB; per-post cards (banner image, or a generated title card) lift CTR.
- **Proposed fix:** Use `post.bannerImage` as `og:image` when present (next/image-optimized variant), else the default card. Effort S.
- **Effort:** S.

### 8. Header nav omits `/learn` (internal-linkage/discoverability gap)
- **Evidence:** `src/components/Header.tsx` nav links are only `/blog`, `/admin`, `/profile`, `/settings` — no `/learn`, no `/tags`.
- **Why it matters:** Learn is a major content pillar; no header link weakens internal linking (SEO) and discoverability for learners.
- **Proposed fix:** Add `/learn` (and optionally `/tags`) to the header nav. Effort S.

### 9. `/blog` client bundle carries all 63 posts (48 KB `posts.ts`) into the listing chunk
- **Evidence:** `posts.ts` = 48,975 bytes, imported wholesale by the client `blog/page.tsx`. Largest prod JS chunk observed ~232 KB.
- **Why it matters:** Unnecessary JS weight on the highest-traffic page; grows linearly with post count.
- **Proposed fix:** Server-render the initial card list (see #3) and load only the visible page client-side, or code-split the full list.
- **Effort:** S–M (rides on #3).

---

## Strengths / no-action items (verified)

- **Build health:** `npm run build` exits 0, compiles in <1s, TypeScript clean, 410 static pages generated with **no warnings**. `prebuild` regenerates `posts.ts` (63) + `learn.ts` (7 series / 109 lessons).
- **Testing:** **384 tests / 59 files pass** (Vitest). Strong unit coverage of completion, quiz, access, catalog, certificate logic.
- **Dependency security:** `npm audit` → **0 vulnerabilities**. Overrides pin `nanoid` 3.3.18.
- **Security headers / CSP:** nosniff, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS (2yr), and a conservative CSP with `connect-src` scoped to Supabase. `robots.txt` disallows `/api/`, `/preview/`, `/admin/`; admin emits `noindex`. **Env hygiene:** `.env*` gitignored; `.env.local` holds only expected keys (public URL + anon key + service role key).
- **SEO infra present:** `robots.ts`, `sitemap.ts` (DB-aware, live-course-gated), `feed.xml` (RSS, cached), per-page canonicals, OG/Twitter meta, JSON-LD on Learn hub/series/lesson. Blog articles lack JSON-LD `Article` schema (minor — OG + canonical present).

---

## Top improvements (priority order)

1. **Wire web analytics** (Vercel Analytics or Plausible) + CSP `connect-src`/`script-src` update — the site is currently unmeasurable. *(S)*
2. **Resolve the canonical-domain mismatch at launch** — `adroit.io/blog` must serve this app + `/og-blog-card.png`, `/sitemap.xml`, `/robots.txt` must resolve, or nothing indexes. *(S–M, launch-gate)*
3. **Server-render the `/blog` listing** (SSG first page + client filter island) to fix LCP/CWV and put content in the SSR HTML. *(M)*
4. **Learn rendering + proxy** — SSG public lessons / client-side gate; skip proxy `auth.getUser()` when no session cookie. *(M)*
5. **Constellations data readiness** — widen `event_type` (quiz/exam/cert), add write sites, fix the unused-`now` streak bug, add rank. *(M)*

---

## "Wow" opportunities

- **Per-post OG cards + first-party share analytics** — lift social CTR and measure it (pairs #1 and #7).
- **Progress-funnel analytics events** (lesson → quiz tier → exam → certificate) giving real product telemetry aligned with Constellations.
- **Constellations entry points** (V2): expose the achievement layer on `/profile` (a "Constellations + Chronicle" panel) and as a call-to-action on course completion / certificate pages — the `completion_events` foundation is already the right store for it once quiz/exam/cert events are added.
