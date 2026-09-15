# Lois — Content, IA & Journey Discovery (adroit-blog)

**Date:** 2026-09-01 · **Tenant:** adroit-blog · **Scope:** Discovery/audit only — no implementation
**Repo:** `~/Documents/Fortress-of-Solitude/adroit-blog` · **Live:** `https://adroit-blog-two.vercel.app`
**Role:** Lois (BA) — information architecture, content quality & coverage, Read → Learn → Cert journey friction, feature gaps, Constellations entry points
**Method:** Live-site crawl (HTTP fetch of SSR HTML: hub, series, lesson, preview, exam, certificate, profile, blog index, categories, tags, 404, feed) + repo source review (routes, `src/data/learn.ts`, `series.json` × 7, `src/lib/paywall.ts`, `src/lib/completion.ts`, `src/app/blog/page.tsx`, `Footer.tsx`, `sitemap.ts`, `robots.ts`).

---

## Executive summary

The content foundation is strong: 63 blog posts, 7 Learn series (109 lessons), a clean 3-section hub taxonomy, and a working paywall/preview model. The problems are **coherence problems, not content-volume problems**:

1. **The certify journey is broken for 6 of 7 series.** Only `omni-studio-cert` ships `exam.json` + `checks/`. Every other series returns **404** on both `/exam` and `/certificate` — including for users who complete all lessons. The site's flagship promise ("tracked to completion", certificates of completion) currently delivers a dead end for the majority of its catalog.
2. **The Learn hub oversells.** Hero copy and JSON-LD promise "multi-level Tracks" and the "Hermes Consultant Track", but the live hub renders only **Certifications** and **Learning Paths** — the **Tracks section is absent** (the 3-level Hermes track, 16 lessons, is not visible to guests at all).
3. **Course descriptions overpromise lesson counts.** Four of seven `series.json` descriptions cite lesson counts 2–4× higher than what exists (e.g. "90-lesson deep dive" vs 27 lessons; "46-requirement" vs 22).
4. **The blog has no way into Learn.** Post pages carry no related-content, no category-anchored Learn CTA, and no TOC. The only cross-link is the global header "Learn" item. The Read → Learn funnel exists on paper, not on the page.
5. **The newsletter is a stub.** Two email-capture forms (footer + categories page) with no `<form>` element, no backend, no API route, no confirmation. It collects nothing and tells users nothing.
6. **No site search.** 63 posts + 109 lessons + 176 tag links, navigable only by category pill or tag browse.
7. **SEO domain mismatch** (shared with Brainiac's finding): every canonical/sitemap/OG URL targets `adroit.io`, where `/blog` and `/learn` currently 404.

Constellations + Chronicle (V2) has **four natural entry points**, the strongest being the lesson-complete moment and the certificate page — but the certificate page must be fixed first, since 6 of 7 series 404 there.

Findings are ranked by impact. Each includes problem, evidence, why it matters, proposed improvement, and rough effort (S/M/L).

---

## HIGH impact

### 1. Certify journey ends in a 404 for 6 of 7 series (exam + certificate pages)
- **Problem:** The Read → Learn → Cert journey — the product's core value proposition — has a broken terminal step for most of the catalog. Users who finish a series hit a 404 instead of an exam or a certificate.
- **Evidence:**
  - Only `content/learn/omni-studio-cert/` contains `exam.json` and `checks/check-1..9.json`. All other series dirs contain only `series.json` + `.mdx` files (verified with `ls content/learn/*/`; `git log` shows sfarch exam files were never committed).
  - `src/app/learn/[series]/certificate/page.tsx:80` — `if (getCertExam(series) === null) notFound();` → certificate page 404s for **every** user state (guest and authenticated) on all series without an exam.
  - Live: `GET /learn/salesforce-architect/exam` → **404**; `GET /learn/salesforce-architect/certificate` → **404**. Omni's exam page renders (200, locked for guests).
  - `src/lib/paywall.ts` builds paywall views with "Subscribe for access" / one-time options — the monetization path is real, but the thing being purchased (a certifiable track) doesn't exist for 6 series.
- **Why it matters:** A learner who completes 27 lessons and is told "issued when all lessons are completed and the cert prep exam is passed at 72% or higher" (certificate page copy, `page.tsx:130`) has no exam to pass. This is a trust-destroying dead end on the site's flagship feature, and it makes the paywall promise unfulfillable for most courses.
- **Proposed improvement:** Two options, decision needed from Chris:
  - (a) **Content path:** author `exam.json` + tier checks for the remaining 6 series (large content effort, but the quiz/check tooling already exists — omni proves the shape).
  - (b) **Scope path:** until exams exist, (i) stop advertising "certificate of completion" on series pages for exam-less series, (ii) make the certificate page render a "completion record" state (all lessons done, no exam yet) instead of 404, and (iii) mark exam-less series as "Learning Path" rather than "Certification" in the hub taxonomy.
- **Effort:** (a) L per series (content), (b) S–M (routing/copy). Recommend (b) now, (a) as a content backlog.

### 2. Learn hub promises "Tracks" that don't render — Hermes Consultant Track (16 lessons) is invisible to guests
- **Problem:** The hub's hero copy and structured data advertise multi-level tracks; the page shows none.
- **Evidence:**
  - Live `/learn`: rendered section headers are only **Certifications** and **Learning Paths** (h2 scan). Course cards: Salesforce System Architect Primer, OmniStudio Developer Certification, Agentic AI Implementation Path, AI at Work. **No Tracks section, no Hermes cards.**
  - Hub hero text: "Learn Certifications, **multi-level Tracks**, and standalone Learning Paths — published daily, read in order, tracked to completion." JSON-LD ItemList description: "…Salesforce certification, **the Hermes Consultant Track**, and agentic AI…"
  - Repo: `content/learn/hermes-consultant/` (6 lessons), `-intermediate/` (5), `-advanced/` (5) all exist with full `series.json` (Level 1/2/3, "Builds on…" chain). `src/data/learn.ts` includes them.
  - Likely cause: the hub only renders groups/series whose `courses` row is `live` (same AC-5 gate as `sitemap.ts:30-60`), and the three Hermes series have no live course row — but the hero copy was written as if they do.
- **Why it matters:** A 16-lesson, 3-level track is the site's most differentiated content (it's the consulting practice, not just a cert). It's either hidden by a missing catalog row (data gap) or deliberately gated (then the copy is lying). Either way, guests see a promise the page doesn't keep — and the JSON-LD tells search engines the same.
- **Proposed improvement:** Decide the Hermes track's status. If live: add the course rows so the Tracks section renders (S, data). If not launched: (i) drop "multi-level Tracks" / "Hermes Consultant Track" from hero + JSON-LD until launch (S, copy), or (ii) render the Tracks section with a "coming soon" card that captures interest. Don't ship hero copy that outruns the catalog.
- **Effort:** S (data or copy), M if "coming soon" cards are wanted.

### 3. Course descriptions overpromise lesson counts (4 of 7 series)
- **Problem:** `series.json` descriptions cite lesson counts far above actual content.
- **Evidence:**
  | Series | Description claims | Actual lessons |
  |---|---|---|
  | salesforce-architect | "A **90-lesson** deep dive" | 27 |
  | omni-studio-cert | "A **46-requirement** deep dive… one requirement per day" | 22 |
  | ai-at-work | "A vendor-agnostic, **30-lesson** primer" | 16 |
  | hermes-consultant | "A **~30-lesson** path" | 6 |
  - Also in-lesson copy: `src/data/learn.ts:21` — agentic-ai lesson 1 excerpt: "The definitions that matter for the whole **90-lesson track**" (agentic-ai has 28 lessons; the 90-lesson track is sfarch — this reads as a copy-paste error).
- **Why it matters:** A learner who signs up for a "90-lesson deep dive" and sees 27 lessons reads it as bait-and-switch. These descriptions are the primary sales copy on the paywall-adjacent series pages.
- **Proposed improvement:** Rewrite the four descriptions to match shipped content (or state the plan honestly: "27 lessons, growing daily" if the daily-cadence claim is real). Fix the agentic-ai excerpt. Add a content-lint check (build-time or CI) that compares `description` lesson-count claims against `lessons.length` so this class of drift can't recur.
- **Effort:** S (copy) + S (lint guard).

### 4. Blog has no path into Learn — the Read → Learn funnel is one header link away from nothing
- **Problem:** A reader finishing a Salesforce post has no on-page route to the Salesforce System Architect series. Cross-surfacing exists only in the global nav.
- **Evidence:**
  - `src/app/blog/[slug]/page.tsx` imports (lines 1-16): Header, Footer, BackLink, ReadingProgress, ShareBar, PostNavigation, BannerImage, Tag, MDXArticle, MarkAsRead, PostReadProgress. **No Learn CTA component, no related-content block.**
  - Live post page (`/blog/test-drive-qwen-local`): 1 "Learn" mention (header only), 0 related-posts section, 0 TOC.
  - No `RelatedPosts`/`related` component anywhere in `src/components/` (grep).
  - `PostNavigation.tsx` only does prev/next post.
- **Why it matters:** The business model is content → Learn subscription. The moment of highest intent (post just finished, "Mark as read" clicked) has no conversion surface. Every reader who would take the next step has to remember the Learn tab exists.
- **Proposed improvement:** Add a context-aware "Keep learning" block at the bottom of each post: match post `category` → recommended series (sf → Salesforce System Architect + OmniStudio; ai → Agentic AI + AI at Work; etc.), with 1-line "why this fits" copy and a progress/lesson-count fact. Reuse the series card component from the hub. A lightweight related-posts row (same category, 3 cards) is a separate small win.
- **Effort:** M (mapping table + one component + copy).

### 5. Newsletter capture is a non-functional stub (two locations)
- **Problem:** The site asks for emails in two places and does nothing with them — no form submission, no backend, no confirmation.
- **Evidence:**
  - `src/components/Footer.tsx:60-72`: email input + "Subscribe" button, no `<form>`, no `onClick`, no handler (verified in source).
  - `src/app/blog/categories/page.tsx:187-212`: second "Subscribe for Updates" block, same pattern.
  - No newsletter API route: `grep -rn newsletter src/app/api src/lib src/data` → 0 matches. No ESP integration in `package.json`.
- **Why it matters:** Users type an email and hit Subscribe and… nothing happens (or a silent no-op). That's worse than no form — it actively burns trust in a consulting brand whose service is operational reliability. It also means the site has no owned audience channel.
- **Proposed improvement:** Either (a) wire it to a real list (ConvertKit/Brevo/Supabase table + API route + success/error states), or (b) remove both blocks until a list exists. Do not ship dead forms.
- **Effort:** S to remove; M to wire to an ESP.

---

## MEDIUM impact

### 6. No search anywhere on the site
- **Problem:** 63 posts + 109 lessons + 176 tag pages, no search box.
- **Evidence:** No `/search` route, no search UI in Header (`src/components/Header.tsx` nav = Posts, Categories, Learn + theme toggle + avatar). The only "search" is the Learn hub's client-side course filter (`src/components/Learn/LearnFilters.tsx:101`, filters 7 courses — not content search).
- **Why it matters:** Once the catalog passes ~20 items per category, browse-only navigation degrades fast. Tag pages (176 of them) are the current substitute, but tags are a flat wall with no ranking.
- **Proposed improvement:** Client-side search over the already-bundled `posts.ts` + `learn.ts` data (both are static imports — a search index costs no backend): header search icon → results overlay with post/series/lesson groups. Effort: M.

### 7. 176 tag pages for 63 posts — long-tail tags dilute IA
- **Problem:** `/tags` lists 176 unique tags for 63 posts (avg 2.8 tags/post). Most tag pages will contain 1 post.
- **Evidence:** Live `/tags`: 176 unique tag links. `sitemap.ts` emits a sitemap entry for **every** tag (priority 0.5) — so the sitemap contains ~176 one-post thin pages.
- **Why it matters:** One-post tag pages are thin SEO pages that dilute crawl budget and give users a false sense of structure. The footer's 6 category links are the real IA; tags are the noise.
- **Proposed improvement:** (i) Curate a controlled tag vocabulary (cap ~40 tags, merge synonyms) — content task; (ii) sitemap: emit only tags with ≥3 posts; (iii) consider hiding the tag cloud behind a "Browse all tags" disclosure on `/tags`.
- **Effort:** M (content curation) + S (sitemap filter).

### 8. Guest profile page is a wall of "Sign in" text with no working link
- **Problem:** `/profile` for guests renders a page full of "Sign in" strings but no actual link to `/login` in the SSR HTML.
- **Evidence:** Live guest `GET /profile`: 12× "Sign in", 6× "login" text, **0** `href="/login"` links, no h1. (Source: `src/app/profile/page.tsx:35` redirects authenticated users' flow, but the guest render path shows CTA text without a real link in the fetched HTML — verify the CTA is a `<Link>` not a `<button>` with no handler.)
- **Why it matters:** The profile page is a natural "what's in it for me" moment (progress, streaks, certificates). As a guest it currently offers the value proposition but a dead door.
- **Proposed improvement:** Guest `/profile` should render a proper "members-only" preview: the real page layout (progress ring, streak, certificate slots) in a locked state, with one clear "Sign in or create account →" link to `/login?next=/profile`. This doubles as a Constellations teaser surface (see #12).
- **Effort:** S–M.

### 9. SEO domain mismatch: canonicals/sitemap/OG point at `adroit.io`, which 404s these routes (corroborates Brainiac #2)
- **Problem:** `siteConfig.url = "https://adroit.io"` (`src/lib/seo.ts:12`). Live `adroit.io/blog` → 404; `adroit.io/sitemap.xml` → 200 but serves the *corporate site's* sitemap.
- **Evidence:** Every canonical on the live staging pages is `https://adroit.io/...`; `robots.ts` declares `Sitemap: https://adroit.io/sitemap.xml`.
- **Why it matters (content/IA angle):** Staging is self-deindexing by design, which is correct pre-launch — but the **content** implication is that no SEO value accrues until launch, and the launch must be atomic (route wiring + OG image + feed on `adroit.io`). The RSS feed (`/feed.xml`, 20 entries) also lives on the staging host only.
- **Proposed improvement:** Track as a launch checklist item (owned with Brainiac's finding): wire `adroit.io/blog/**` + `/learn/**`, verify `/og-blog-card.png`, `/sitemap.xml`, `/feed.xml` resolve on the canonical domain, then remove the staging canonicals.
- **Effort:** S–M (launch ops, no content change).

### 10. Blog listing is a client-only shell (corroborates Brainiac #3) — content/IA angle
- **Problem:** `/blog` SSR HTML contains "Loading posts…" and zero post cards (verified: 20.6 KB page, 1 post link = `/blog/categories` only).
- **Evidence:** `src/app/blog/page.tsx:1` is `"use client"` with a Suspense fallback; pagination is 4 posts/page client-side (`page.tsx:37`).
- **Why it matters (content/IA angle):** Beyond perf/SEO, this means the blog index — the front door — shows nothing to a no-JS visitor, a slow connection, or a crawler. The 63-post archive, the site's biggest content asset, is effectively invisible until JS executes.
- **Proposed improvement:** Server-render page 1 of cards; keep filter/sort/pagination client-side (Brainiac's fix). Content-side note: with 4/page and 63 posts that's 16 pages of pagination — consider 8/page or infinite scroll to reduce the number of "Load more" clicks a reader needs to reach older posts.
- **Effort:** M (shared with Brainiac) + S (page size).

### 11. `not-found.tsx` missing — 404 is the bare Next.js default (corroborates Kara #2)
- **Problem:** No `src/app/not-found.tsx`. Live `/nonexistent` = unbranded "404 | This page could not be found." with no nav, no CTAs.
- **Why it matters (content/IA angle):** Given findings #1 (6/7 series certificate pages 404) and #9 (launch routing), 404s are a *frequent* destination on this site right now. Each one is a churn moment with no way out.
- **Proposed improvement:** Kara owns the design; content ask: the 404 page should carry 3 CTAs — "Back to the blog", "Browse Learn", "Contact us" — and the Learn link should go to the hub (not a series), since most 404s will be deep learn URLs.
- **Effort:** S (Kara's finding; noted here for the journey context).

---

## LOW impact / hygiene

### 12. Constellations + Chronicle — entry point map (V2 planning input)
- **Context:** `src/lib/completion.ts` (`deriveProgress`) already tracks lessons/courses/tracks completed, streak days, and longest streak from the append-only `completion_events` log. Kara/Brainiac have flagged data gaps (no quiz/exam/cert event types; unused `now` param → stale current streak). Design mockups exist under `design/t_cffa75b8/` (hub-constellation-hero, chronicle-constellation-seam, course-outline-v2).
- **Candidate entry points, ranked by delight-per-effort:**
  1. **Lesson-complete moment** (lesson page, after "Mark complete" succeeds): a small constellation "star ignites" micro-moment + streak counter ("3-day streak"). This is the highest-frequency delight beat and where the habit loop closes. *Blocker:* needs the `now`-param streak fix (Brainiac #5) or streaks will display stale.
  2. **Certificate page** (per series): the natural "constellation complete" surface — a named constellation per series, with the Chronicle line for that course. *Blocker:* finding #1 — 6 of 7 series 404 here, so this surface must exist before it can carry the visual.
  3. **Profile / members page**: the full sky — all constellations (one per completed series/track), streak, rank ladder. The guest version (finding #8) becomes the teaser: locked stars = the value proposition.
  4. **Learn hub**: a subtle "your sky" strip for authenticated users (constellations in progress), not a hero takeover — the hub hero mockup exists but the hub is a *discovery* surface; keep it light.
  5. **Track pages** (when Hermes track goes live, finding #2): a 3-star track constellation (Level 1→2→3) that lights per level — the only surface where "track" completion is visible.
- **Content/IA recommendation:** sequence the work as (1) fix #1 (certificate surface exists), (2) profile sky, (3) lesson-complete micro-moment, (4) hub strip. The Chronicle (narrative log) belongs on the profile, fed by the same events — no new IA surface needed.

### 13. Minor copy/consistency items
- **Blog categories use short codes** (`?category=sf`, `react`, `ai`, `mkt`, `ux`, `pm`) in URLs while display labels are full words (`src/app/blog/page.tsx:18-25`). Fine functionally; the codes leak into footer links and are invisible to users. Acceptable, but a future rework should use slugs.
- **"Adroit BLOG" wordmark** in the header (`<a href="/blog">A Adroit BLOG</a>`) reads oddly in running text; the footer says "Adroit Consulting". Minor brand-consistency note for Kara.
- **Feed shows 20 of 63 posts** (`/feed.xml` = 20 entries). Standard RSS behavior, but a content note: the feed is the main syndication surface and only ~32% of the archive is reachable from it.
- **`hermes-consultant` Level 1 description** says "Platform-agnostic skills with Hermes…" — the ellipsis-truncated series descriptions in `learn.ts` render fine, but the three Hermes descriptions all lead with "Level N of the Hermes Consultant track" with no standalone value prop for a guest who hasn't met the track (matters once #2 is fixed and the track renders).

---

## Suggested priority order (for the orchestrator)

| # | Finding | Effort | Lane |
|---|---|---|---|
| 1 | Exam/certificate 404s on 6/7 series | S–M (scope fix) / L (content) | Content + Steel |
| 2 | Hub "Tracks" promise vs. empty section | S | Data or copy |
| 3 | series.json lesson-count overpromises + lint guard | S | Content + Steel |
| 4 | Post → Learn "Keep learning" block | M | Steel + copy |
| 5 | Newsletter stub: wire or remove | S / M | Steel |
| 6 | Client-side search | M | Steel |
| 7 | Tag curation + sitemap tag filter | S–M | Content + Steel |
| 8 | Guest profile → real sign-in CTA + locked preview | S–M | Steel |
| 12 | Constellations entry-point sequencing | planning input | Jor-El/Brainiac + Kara |

**Wow opportunities:** (1) the lesson-complete constellation micro-moment (habit loop + delight at the exact moment of progress), (2) the guest "locked sky" profile preview (turns the paywall page into a value demo), (3) a working post → Learn funnel that converts the blog's traffic into Learn signups.

**Open questions for Chris:**
1. Hermes Consultant track — is it launching? (Decides finding #2: data fix vs. copy fix.)
2. Exams for the 6 non-omni series — content backlog, or should cert-less series stop advertising certificates now? (Finding #1.)
3. Newsletter — is there an ESP account to wire, or should the forms come down? (Finding #5.)
