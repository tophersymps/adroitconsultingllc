# Adroit Consulting Site

The **Adroit Consulting site** — a [Next.js](https://nextjs.org) (App Router) application hosting the Adroit Consulting **blog** and the **Learn tab** (learning paths and certification-prep courses). Published content is authored as MDX and generated into static data at build time; user accounts, progress, and quizzes are backed by [Supabase](https://supabase.com).

- **Production:** `https://adroit-blog-two.vercel.app` (Vercel project `adroit-blog`; auto-deploys on push to `main`)
- **Documentation:** [Wiki](https://github.com/kelex1812/adroit-blog/wiki)
- **Project board:** [Adroit Consulting Site](https://github.com/users/kelex1812/projects/1) (GitHub Projects)

> The production domain `adroit.io/blog` is intentionally not wired until launch. The site is staged on the private Vercel deployment.
## What's New

### Release v1.0.0 — Omni Content and Constellation Enhancement (aggregates 6 builds) — 2026-09-02

This named release, tagged `v1.0.0` at commit `e51bdcc` (release `Omni-Content-and-Constellation-Enhancement`, `rel_1fd243a8`), aggregates six builds that together give every course a real structure on the Learn tab and turn each course into a constellation you can watch ignite. On the content side, all six non-OmniStudio series (Salesforce System Architect Primer, Agentic AI Implementation Path, AI at Work, and the three Hermes Consultant tracks) were raised to the full Omni bar with per-lesson questions, block-level knowledge checks, timed cert-prep practice exams, and a uniform certificate standard (B-25/B-28, t_4204244b); the Omni content was regenerated so quiz answers are complete sentences with clear, unambiguous distractors (t_1b282209) and a follow-up cleared 215 remaining ellipsis-truncated central-focus answers (t_88d1fedc). On the experience side, each course now renders as a connected star-outline constellation whose lesson-stars ignite on completion, the Learn hub shows a compact constellation preview per course card, and completed milestones (lesson, course, quiz, exam, certificate) build a personal Chronicle with a rank that climbs from Starseed toward Celestial (Constellations + Chronicle, B-18 t_c72908a6, on the Constellations data foundation B-19 t_e9c1c761). A dark-mode fix also raised the red SeriesProgress progress fill to readable contrast, 2.18:1 up past the WCAG AA 3:1 threshold (t_0271699e).

**Verified live** at https://adroit-blog-two.vercel.app: `/learn` and `/learn/salesforce-architect` return HTTP 200 with the honest published lesson counts, the full ALL LESSONS bar, the Constellation section, and constellation previews on the course cards. All six builds passed their full audit chains (A11y/lara, QA/zod, Security/val-el). Deploy note for t_e9c1c761/t_c72908a6: apply migration `docs/010-constellation-foundation.sql` via `supabase db push` before new quiz/exam/certificate event types write to a live DB (code fails soft until then). Auth-gated surfaces (Chronicle feed, profile full-sky rank hero, celebration overlay) need a signed-in account; guests see locked/teaser states and no real progress data.

### Course structure + cert standards to the Omni bar (B-25/B-28) — 2026-09-01

The Learn tab now gives every course a real course structure: all 6 non-OmniStudio series (Salesforce System Architect Primer, Agentic AI Implementation Path, AI at Work, and the three Hermes Consultant tracks) were raised to the Omni bar with per-lesson questions, block-level knowledge checks, and timed cert-prep practice exams, plus a uniform certificate standard (commit `18e1a2d`, build t_4204244b, deploy gate t_0641f6b9 passed). On each series page the ALL LESSONS bar shows the true published lesson count (e.g. "28 published" for the Salesforce Primer) instead of an over-claimed total. Each series now ships a set of Knowledge Checks (pooled, 80% required to pass — e.g. KC1 covers Lessons 1-5 of the Salesforce Primer) that gate a timed cert-prep exam (a 105-minute run); the exam stays LOCKED until every knowledge check is passed at 80%+. The certificate page renders a clear eligibility checklist — all lessons complete + all knowledge checks ≥ 80% + exam passed at ≥ 72% — unlocking the certificate of completion when all three are met. The build is a content commit (machine-generated question/check/exam JSON plus a generator and validator script); no production runtime code changed.

**Verified live** at https://adroit-blog-two.vercel.app: `/learn` HTTP 200 with all 6 raised series showing real lesson counts, `/learn/salesforce-architect` HTTP 200 with the honest "0 of 28 complete / 28 lessons published" hero and the full ALL LESSONS bar, the Knowledge Check 1 quiz (Lessons 1-5, 15 questions) rendering, the CERT PREP EXAM LOCKED gate with its "Checks passed 0/6" tracker, and the certificate eligibility checklist (28 lessons / exam ≥ 72% / 6 checks ≥ 80%). All three audits PASS on commit 18e1a2d — A11y (lara) 0 findings, QA (zod) APPROVED 461/461 tests (validator green on all 6 series, no answer-key leak, certificate rule uniform), Security (val-el) 0 crit/high/med/low (server-graded and tamper-resistant; content clean of scripts/secrets/PII). Post-audit content fix (truncated-fragment answers) landed via t_1b282209/t_bcb71c5a and re-validated at HEAD. Review burden ~132 files / +10,271 lines (content JSON), complexity LOW, risk LOW. Human-judgment item: the MCQs are machine-generated from lesson text, so spot-check a sample per series before treating the courses as customer-facing.

### Fix a11y: Constellation celebration focus/Escape + FullSky rank announcements (B-18) - 2026-09-01

The B-18 accessibility fix (commit be15975, build t_96d952ef) remediates three a11y findings on the Constellation celebration and the profile full-sky rank ladder. The star-ignition celebration overlay is no longer labeled as a dialog it can never behave like: it was a `role="dialog"`/`aria-modal=false` non-focusable dialog without focus management, and is now a transient `role="status"`/`aria-live="polite"` region - the correct ARIA pattern for an auto-dismissing, non-interactive overlay - and its Escape-to-dismiss handler is now genuinely wired (previously documented but not attached). On the profile full-sky hero, the duplicate decorative rank-name span is marked `aria-hidden`, and the bare "· you" and "✓" rank-ladder indicators carry `role="img"` + `aria-label` with glyphs hidden from assistive tech. These close WCAG 2.4.3 (focus order - no false dialog focus trap), WCAG 2.1.1 (Escape keyboard dismiss), and WCAG 4.1.2 (correct role/name/state). Pure ARIA/presentational - no visual or behavior change for sighted users.

**Verified live** at https://adroit-blog-two.vercel.app: `/learn` HTTP 200 rendering the constellation previews on all 7 course cards and `/learn/salesforce-architect` HTTP 200 rendering the full 28-lesson SALESFORCE SYSTEM ARCHITECT PRIMER CONSTELLATION, confirming the build is deployed. Both feature areas this fix touches (the celebration overlay and the profile full-sky hero) are auth-gated (signed-in only; guests see a locked-sky teaser on `/profile` and no celebration), so no live signed-in screenshot was captured - nothing faked; they were verified by source review, TypeScript, lint, and the unit suite instead. All three audits PASS on commit be15975 - A11y (lara) 0 findings, QA (zod) APPROVED 462/462 tests including a new Escape-dismiss test, Security (val-el) 0 findings. Review burden ~3 small files, complexity LOW, risk LOW.

### Capture screenshots of new feature areas - 2026-09-01

This build captured production screenshots of three new feature areas on the live Adroit Blog so the shipped functionality is documented end-to-end (build t_071108e8). `deliverables/post-to-learn.png` shows the "Keep learning" Post→Learn funnel at the bottom of a blog post — the Agentic AI Implementation Path track (29/29 lessons) with its "Preview first lesson" / "Go to Agentic AI Implementation Path" call-to-action. `deliverables/related-posts.png` shows the "More in AI & Consulting" 3-card related-posts row beneath the funnel. `deliverables/search.png` shows the site-search overlay (B-21) in action: the full-screen `aria-modal` dialog with a search for "salesforce" returning results grouped by POSTS / SERIES. All three PNGs are genuine 3172x3056 captures taken live from production (https://adroit-blog-two.vercel.app); none are auth-gated and none were fabricated.

This is a screenshot/deliverable build — no app code changed, so the deliverables folder itself is the shipped artifact, giving the team and client a reviewable snapshot of the new feature areas. All three audits PASS on the build: A11y (lara) 0 findings — all 3 PNGs genuine, distinct MD5, non-blank, correct content; QA (zod) APPROVED with 2 LOW non-blocking observations about the captures (search.png shows 10 visible items rather than a literal "20 results" counter — the live site does return 20 per the deploy smoke test; the funnel CTA labels read "Preview first lesson" / "Go to Agentic AI Implementation Path" rather than the literal "Start track", both CTAs present); Security (val-el) 0 findings — no secrets, PII, internal URLs, or draft/private content. Risk LOW.

### Fix: dark-mode red progress fill contrast on SeriesProgress — 2026-09-01

The red progress fill on the course SeriesProgress track (and the matching `QuizWidget` accent) now renders at readable contrast in dark mode (commit `2723109`, build t_0271699e). The fill was previously `#C8102E`-adjacent at a 2.18:1 color-contrast ratio against its dark background — below the WCAG 2.1 AA 3:1 minimum for non-text contrast (1.4.11). It now uses a lighter dark-mode red (`#f05066`) that clears the 3:1 threshold while staying on-brand. The change touches ~6 lines across `src/components/Progress/ProgressIndicator.tsx` and `src/components/Progress/QuizWidget.tsx` plus the `scripts/contrast.js` verification script and a CHANGELOG entry. Purely presentational — no logic, data, or API behavior changed.

**Verified live** at https://adroit-blog-two.vercel.app: both the blog landing read-progress bar and the `/learn/salesforce-architect` SeriesProgress bar render in dark mode with the corrected fill (`rgb(240, 80, 102)` = `#f05066`) confirmed in the page's computed styles and checked against the 3:1 threshold. All three audits PASS on commit 2723109 — A11y (lara) 0 findings, QA (zod) APPROVED 461/461 tests browser-verified, Security (val-el) 0 vulnerabilities (1 informational). Review burden ~6 lines / 4 files, complexity LOW, risk LOW. Note: the new dark red is a subjective shade choice; a designer may eyeball it for preference, but it is not a correctness issue.

### Constellations + Chronicle feature (B-18) — 2026-09-01

The Learn platform now renders each course as a **constellation** and records a **Chronicle** of your completed milestones (feature commit `e18032b` + a11y fix `be15975`, build t_c72908a6, on the B-19 `completion_events` data foundation). **Constellations:** a new `CONSTELLATION` section on each series page (`src/app/learn/[series]/page.tsx`) lays out the full series as a connected star outline so the whole path is visible at a glance, with each lesson a star that ignites when completed; the Learn hub renders a compact constellation preview on each course card alongside the existing progress bar and "N of M complete" label. **Chronicle + rank:** completing a lesson/course/quiz/exam/certificate appends a milestone to your Chronicle feed, and your profile shows a full-sky hero with a rank ladder (Starseed to Celestial, `deriveRank` in the pure-TS rank ladder) drawn from your completion history. The build adds a new `GET /api/progress/achievement` endpoint and server-side data loaders (`sky.ts`/`sky-server.ts`). The star-ignition celebration is a transient `role=status`/`aria-live=polite` region with a wired Escape handler (a11y-resolved), and every signed-in surface stays auth-gated so guests never see real progress data.

**Verified live** at https://adroit-blog-two.vercel.app: `/learn` HTTP 200 rendering the constellation previews on all 7 course cards, and `/learn/salesforce-architect` HTTP 200 rendering the full 28-lesson SALESFORCE SYSTEM ARCHITECT PRIMER CONSTELLATION (0/28 until lessons complete); the achievement API returns the expected empty guest-stats payload (auth gating holds). All three audits PASS on final commit be15975 — A11y/SEO 0 findings (celebration converted from a mislabeled dialog to a transient status region, rank name deduplicated, ladder glyphs accessible), QA APPROVED 462/462 tests with all 4 acceptance criteria browser-verified, Security 0 findings with RLS own-or-admin scoping and no injection/XSS/secrets. Review burden 35 files / ~2,492 insertions, complexity MEDIUM, risk LOW. Action for deploy: apply migration `docs/010-constellation-foundation.sql` via `supabase db push` before new quiz/exam/certificate event types write to a live DB (code fails soft until then).

### Quick-win A — Trust labels + progress affordances (B-01, B-04, B-05, B-10) — 2026-09-01

A truthfulness-and-progress pass across the Learn Platform v2 (feature commit `1be2c5c`, build t_9cd41aaa). **B-01 — series-hero content metric relabeled:** the `LessonProgress` counter in `src/app/learn/[series]/page.tsx` now reads "N lessons · published" (a content metric — lessons present vs. the highest lesson number) instead of a misleading "Lesson N of M"; "N of M complete" is now exclusively owned by `SeriesProgress`. **B-04 — lesson-count overpromises removed + a build-time lint guard:** four `content/learn/*/series.json` descriptions plus in-lesson excerpt copy that over-claimed published totals were corrected (salesforce-architect "90-lesson"→28, omni-studio-cert "46-requirement"→23, ai-at-work "30-lesson"→16, hermes-consultant "~30-lesson"→7), and a new `assertNoLessonCountOverpromise()` in `scripts/build-learn.js` fails `npm run build` if any description/excerpt count-claim ever exceeds the published lesson count again. **B-05 — empty-progress affordances visible in light + dark:** dark-mode variants were added to the empty progress track (`ProgressIndicator`, `SeriesProgress`, `LessonCompleteProgress`, `PostReadProgress` loading states), the unchecked `MarkComplete` border, the "Not read yet" empty bar, `CheckCardList` empty check rows, and the locked `ExamCard` status bar/button; the filled state stays red. **B-10 — Hermes track "coming soon" via the access seam:** `buildCatalogEntries` visibility in `src/lib/access.ts` changed so a `pending` course now renders publicly as a coming-soon card when its access model is NOT `granted` (D1); a pending-`granted` course stays stealth-hidden from non-entitled members (visible to matching grant holders + admins), and archived courses stay hidden from non-admins.

**Verified live** at https://adroit-blog-two.vercel.app: the landing page (`/blog`) serves HTTP 200 with the read-progress bar and trust label ("0 of 64 posts read / 0% / Sign in to sync"), and `/learn/salesforce-architect` HTTP 200 rendering the relabeled "28 lessons · published" series-hero metric with the trust labels. All three audits (a11y/lara, QA/zod, security/val-el) PASS — 387 tests green (3 new access-seam cases), lint clean, security 0 findings at any severity; one non-blocking WCAG 1.4.11 dark-mode progress-fill contrast finding (2.18:1) shipped with this build and was routed to fast-follow fix t_0271699e (the same info is redundantly conveyed by an adjacent text label). Risk LOW. Commit 1be2c5c.

### Post→Learn funnel, related posts, and site search (B-20, B-21, B-22) — 2026-09-01

Three Phase-3 content-and-conversion features shipped together (feature commit `fda74a9`). **B-20 — Post → Learn funnel + related posts:** a new `KeepLearning` block (`src/components/BlogPost/KeepLearning.tsx`) renders at the bottom of every blog post — a context-aware "Keep learning" pitch card that maps the post's category to a recommended Learn series with a one-line reason (`src/lib/funnel.ts` `CATEGORY_FUNNEL`), reusing the same `PathCard` component the /learn hub renders so the pitch never diverges from the hub (unmapped categories render no card, so nothing is force-mismatched) — plus a same-category related-posts row ("More in <category>", 3 `PostCard`s). **B-21 — Client-side site search:** a self-contained `SearchOverlay` (`src/components/SearchOverlay.tsx`) — search icon + full-screen `aria-modal` dialog opened from the header (desktop + mobile). `src/lib/search.ts` builds a grouped index over the static `posts.ts` + `learn.ts` datasets (no backend), matching title/excerpt/tags/category with diacritic-folding; results group under Posts / Series / Lessons with a live `role=status` results region, Escape closes and restores focus to the trigger (WCAG 2.4.3), body scroll locks, and clicking a result navigates and resets. **B-22 — Canonical tag vocabulary:** a curated 40-tag vocabulary (`src/lib/tag-vocab.ts`, each tag with a short definition surfaced on `/tags/[tag]` pages) replaces the fragmented long tail — `scripts/apply-tag-vocab.js` merges every synonym across blog + learn frontmatter into a canonical tag (281 distinct tags → 40), and a `tag-vocab-check.js` guard verifies zero non-canonical tags remain. Data regenerated via `npm run prebuild`.

**Verified live** at https://adroit-blog-two.vercel.app: `/blog/ai-strategy-2026` HTTP 200 rendering the "KEEP LEARNING" section with a "Start track" CTA, the Agentic AI Implementation Path track (29/29 lessons) and a related-posts "More in AI & Consulting" row; the search overlay opens as an `aria-modal` dialog and typing "salesforce" returns 20 results grouped by Posts/Series/Lessons; `/tags/salesforce` HTTP 200. All three audits (a11y/lara, QA/zod, security/val-el) PASS; 423 tests green (19 new). Risk LOW. Commits fda74a9, dcdc609 (search-overlay a11y follow-up).

### Slash-slug tag pages now resolve — /tags/ui-ux and /tags/ci-cd (B-22) — 2026-09-01

Tag pages for topics whose names contain a slash (UI/UX, CI/CD) used to 404 because the tag slugifier turned the slash into a multi-segment URL (`/tags/ui/ux`) that can never match the single-segment `/tags/[tag]` route. The slugifiers in `src/lib/tag-vocab.ts` (`slugOf`) and `src/lib/tags.ts` (`getAllTags`) now replace `/[^\w]+/g` with `-`, so UI/UX → `ui-ux` and CI/CD → `ci-cd`: `/tags/ui-ux` and `/tags/ci-cd` now render a full tag page (topic definition, post count, sortable post list). `getAllTagSlugs`, `generateStaticParams`, and the sitemap all derive from the same slugifiers, so they updated automatically — the sitemap now emits only single-segment tag slugs.

**Verified live** at https://adroit-blog-two.vercel.app: `/tags/ui-ux` and `/tags/ci-cd` return HTTP 200 with content; old slash-slugs `/tags/ui/ux` and `/tags/ci/cd` return 404 (intentional, consistent with any unknown slug). All three audits (a11y/lara, QA/zod, security/val-el) PASS; 436 tests green; tag vocab gate 40 canonical / 0 non-canonical. Risk LOW. Commits 9274981, 4b39be7, 05960e0.

### /blog 8-card grid statically server-rendered (SSR/CWV fix) — 2026-09-01

The `/blog` 8-card post grid is now statically server-rendered, so the first page of post titles and excerpts is present in the initial HTML instead of shipping as blank loading skeletons. Root cause: every grid card rendered an `animate-pulse` skeleton whenever `useReadProgress.isLoading` was true (it starts `true` during SSR), and `BlogListingContent`'s `useSearchParams()` forced the whole listing tree to render client-side during static prerender — so the raw HTML contained zero card content and only a `Loading posts…` fallback. `PostCardWithRead` no longer gates on `isLoading`; it always renders the full `PostCard` (`isRead` defaults `false` on both server and first client paint, hydration-safe), and a new `BlogListingStaticFallback` renders the real default first page (featured hero + 8 cards, newest-first) as the inner Suspense fallback. Read-dimming and mark-as-read remain client-side progressive enhancement after hydration.

**Verified live** at https://adroit-blog-two.vercel.app/blog: HTTP 200 with all 8 post-card `<h3>` titles in the initial HTML and zero grid skeletons (the only remaining `animate-pulse` is the decorative Featured badge dot). All three audits (a11y/lara, QA/zod, security/val-el) PASS; 427 tests green (4 new). Risk LOW. Commit c6b2702.

### Quick-win B — Trust + conversion (B-03, B-09, B-07, B-11) — 2026-09-01

Quick-win B is a trust-and-conversion pass across the public site. A wrong or moved URL no longer dead-ends: `src/app/not-found.tsx` now renders a branded navy-and-red 404 with three real CTAs (Back to blog, Browse Learn, Contact us) instead of a bare error. The guest `/profile` page (`src/components/Profile/GuestProfileTeaser.tsx`) replaces a wall of dead "Sign in" strings with a locked "your sky" value demo and one real CTA to `/login?next=/profile`. Certificate pages for exam-less series (`src/app/learn/[series]/certificate/page.tsx`) no longer 404 — `generateStaticParams` prerenders every series and an exam-less series renders an interim "Completion Record / exam coming soon" state (decision D2). Both dead newsletter forms (footer + blog/categories) were removed per decision D4, tightening the footer grid from 4 to 3 columns.

**Verified live** at https://adroit-blog-two.vercel.app: any unknown route returns the branded 404, the guest /profile teaser renders, and course certificate routes return HTTP 200 (no more bare 404s). All three audits (a11y/lara, QA/zod, security/val-el) PASS; 393 tests green (6 new). Risk LOW. Note: the interim "Completion Record" state is reachable for a signed-in learner on a path whose cert-prep exam is not yet published — on this live build most series now have an exam authored, so the state shows while an exam is pending.

### Constellations data foundation (B-19) — 2026-09-01

B-19 lays the data foundation for the Constellations and Chronicle experience. `completion_events` is widened (migration 010) to record quiz, exam, and certificate milestones in addition to lesson and course completions, with a server-derived metadata JSON envelope and a `(user_id, event_type)` kind-index (RLS unchanged). Both write sites now append events: `POST /api/progress/quiz/run` logs a quiz event plus a passed-exam event when a cert-prep exam scores >= 72 (server-graded `{score,correct,total}` envelope), and the certificate page appends exactly one idempotent certificate event when eligible. The long-standing streak bug is fixed: `deriveProgress` computes the current streak relative to the injected clock, returning 0 when the most recent completion is neither today nor yesterday (with a dedicated regression test). A pure-TypeScript rank ladder (`RANK_LADDER`: starseed 0/0, wayfarer 5/0, explorer 20/2, polestar 50/4, celestial 100/8) and `deriveRank` give every learner a never-null progression level. This is a backend/schema + logic change (no rendered markup); the Constellation star-grid previews on the Learn hub and the upcoming streak/rank/sky surfaces are built on top of it.

**Verified live** at https://adroit-blog-two.vercel.app/learn: HTTP 200 with the constellation previews rendering on every course card. All three audits (a11y/lara, QA/zod, security/val-el) PASS; 443 tests green (6 new). Risk LOW. Note: apply migration 010 via `supabase db push` before quiz/exam/certificate events are written to a live DB (code fails soft until then).

### SSR /blog listing + client filter island (B-08) — 2026-09-01

The `/blog` index is now a **server-rendered listing** with a thin **client filter island**. `src/app/blog/page.tsx` is a server component that resolves the `posts` dataset server-side and renders the first page (featured hero + 8 post cards + pagination) into the initial HTML — addressing Brainiac findings #3 (client-only shell hurting LCP/INP/CWV and under-rendering for partial-JS crawlers) and #9 (the ~48 KB `posts.ts` riding in the client JS bundle; it is now resolved on the server, not shipped as an executable client chunk). The interactive controls (category pills, All/Unread/Read filter, sort toggle, pagination) live in `src/components/BlogListing/BlogListingClient.tsx`, a `"use client"` island that hydrates on top of the server-rendered content and preserves the featured-post hero, read-progress bar, and guest sign-in prompt. Posts per page bumped 4 → 8.

**Verified live** at https://adroit-blog-two.vercel.app/blog: HTTP 200 with the 8 post cards present in the raw HTML (no `BAILOUT_TO_CLIENT_SIDE_RENDERING`, no "Loading posts…" fallback), and the client filter island mounts and reacts — clicking Unread toggles state, updates the URL to `?read=unread`, and re-renders the list. Zero console/network errors. All three audits (a11y/lara, QA/zod, security/val-el) PASS; 427 tests green.

### Password-reset update route hardening: origin check + rate limit (PR #174) — 2026-08-31

The password-reset update API route (`/api/auth/reset-password/update`) now has defense-in-depth hardening that was committed but never shipped. Two guards now run before any request body is parsed: (1) an origin check that rejects cross-origin requests with HTTP 403 (CSRF protection, CWE-352), and (2) a per-IP sliding-window rate limit (30 requests/min) that returns HTTP 429 (brute-force protection, CWE-307). This closes the gap where the hardening existed in code but was not live in production. Verified live: cross-origin POST returns 403, homepage returns 200. All three audits (a11y/lara, QA/zod, security/val-el) PASS; 384 tests green. Risk LOW (defense-in-depth on an auth-gated route, +77/-3 lines across 3 files).

### A11Y fix: focus indicators + hint-text contrast on auth forms (v1.0) — 2026-08-31

The password-reset flow's auth forms (forgot-password, reset-password, login) now meet WCAG accessibility standards. Two a11y audit findings were fixed: (1) WCAG 2.4.7 Focus Visible (HIGH) - removed focus:outline-none from the five text inputs so keyboard focus shows a visible brand-red ring; and (2) WCAG 1.4.3 Contrast (MEDIUM) - raised hint text from text-gray-400 to text-gray-500 so helper text passes WCAG AA on white. Purely presentational Tailwind class edits; no auth logic, data, or API changes. All three audits (a11y/lara, QA/zod, security/val-el) PASS; 384 tests green.
### Password Reset flow (2026-08-31)

The Adroit Academy now has a full password-reset flow. Users request a secure, one-time reset link from `/forgot-password` (valid for 30 minutes and enumeration-safe, so it never reveals whether an account exists); a valid link opens the new-password form to set a new password. The flow is backed by enumeration-safe request, authenticated update, and resend-confirmation API routes plus a Supabase recovery-code callback. The reset page gates server-side before rendering markup: a guest with no valid reset session is redirected to `/login?next=/reset-password`, and expired/invalid links show a `role=alert` error with a "Request a new link" action and zero password inputs (flow t_e25638b3; gate fix t_13982e68, PR #172).

### /reset-password no longer leaks the new-password form to guests (2026-08-31)

The password-reset new-password page is now gated server-side before any markup renders. Visitors without a valid reset session are redirected to `/login?next=/reset-password`, and expired/invalid reset links show a `role=alert` error message with a "Request a new link" action instead of password fields. This closes the SSR leak where the raw new-password form HTML was served to any unauthenticated visitor. Security headers (CSP, HSTS, X-Frame-Options DENY) verified on the route.

### Paywall panel Light-mode contrast fix (2026-08-30) — 2026-08-30

Course-locked Paywall now renders as a dark navy panel with readable white text in Light mode (was white-on-light). Ships the .paywall-panel rule in globals.css reusing existing tokens, plus the follow-up accent-label contrast fix (4.88-5.75:1 AA).


## Stack

| | |
|---|---|
| **Framework** | Next.js 16 (App Router), React 19 |
| **Styling** | Tailwind CSS v4 with semantic design tokens |
| **Content** | MDX (blog + learn) → generated static data |
| **Backend** | Supabase (auth, progress, quizzes, course catalog) |
| **Testing** | Vitest + React Testing Library |
| **Deployment** | Vercel (auto-deploy on push to `main`) |

## Quick Start

```bash
npm install          # install dependencies
npm run dev          # development server (default :3000)
```

Requires the Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

Production build:

```bash
npm run build        # prebuild (generates data) + next build
npm start            # run the production build
```

## Project Layout

```
content/
  blog/<slug>.mdx          # blog articles (frontmatter-driven)
  learn/<series>/          # learning lessons + series.json
scripts/
  build-posts.js           # regenerates src/data/posts.ts
  build-learn.js           # regenerates src/data/learn.ts
src/
  app/                     # App Router pages + API routes
  components/              # React components (Blog, Learn, Progress, MDX)
  lib/                     # helpers, Supabase clients, access seam, mdx
  data/                    # GENERATED static data (do not hand-edit)
  shared/                  # contracts + types
docs/                      # architecture, plans, audit reports
supabase/                  # migrations, config
```

## Key Scripts

```bash
npm run dev          # development server
npm run build        # prebuild + next build
npm run prebuild     # node scripts/build-posts.js && node scripts/build-learn.js
npm run lint         # eslint
npm test             # vitest run
npm run test:watch   # vitest watch
```

## Documentation

Full documentation lives in the **repo wiki**:

- [Architecture](https://github.com/kelex1812/adroit-blog/wiki/Architecture)
- [Content Pipeline](https://github.com/kelex1812/adroit-blog/wiki/Content-Pipeline)
- [Learn Tab & Course Progression](https://github.com/kelex1812/adroit-blog/wiki/Learn-Tab-and-Course-Progression)
- [Auth & User Progress](https://github.com/kelex1812/adroit-blog/wiki/Auth-and-User-Progress)
- [Admin & Course Catalog](https://github.com/kelex1812/adroit-blog/wiki/Admin-and-Course-Catalog)
- [Development Setup](https://github.com/kelex1812/adroit-blog/wiki/Development-Setup)
- [Testing](https://github.com/kelex1812/adroit-blog/wiki/Testing)

For AI agents: read the Next.js version docs in `node_modules/next/dist/docs/` before writing code — this version has breaking changes vs older Next.js.

## Contributing Notes (Fortress conventions)

- **Never hand-edit `src/data/posts.ts` or `src/data/learn.ts`** — they are generated by `prebuild`. Regenerate instead.
- **No em-dashes** anywhere; content follows the Fortress writing standards (no AI-slop, GFM endnote citations).
- Content is authored as MDX; course status + entitlements live in the database, not in content files.
- Commits land on `main` and auto-deploy. Keep the working tree clean of worker scratch (see `.gitignore`).

## License

Not yet licensed.
