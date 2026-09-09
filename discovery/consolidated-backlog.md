# Consolidated Improvement Backlog — adroit-blog

**Date:** 2026-09-01 (rev 2, post-consultation) · **Tenant:** adroit-blog · **Prepared by:** Lois (BA)
**Inputs:** `lois-discovery.md` (content/IA/journey, 13 findings) · `kara-discovery.md` (visual/UX, 12 findings) · `brainiac-discovery.md` (technical/perf/SEO/analytics, 9 findings)
**Live:** `https://adroit-blog-two.vercel.app` · **Repo:** `~/Documents/Fortress-of-Solitude/adroit-blog`

---

## Decision log — 2026-09-01 consultation (Chris)

All three open questions are now decided, plus two new directives. These supersede the original Q1–Q3.

| # | Decision | Impact on backlog |
|---|---|---|
| D1 | **Hermes Consultant track IS launching.** Build "coming soon" placeholder cards so the Tracks section renders for pending courses. Access-aware visibility: a `pending` + `granted` course is hidden from external viewers (visible only to granted users); any other Access model renders the coming-soon card publicly. | B-10 / B-27 become **in-scope** — build the placeholder + access-aware catalog rows. |
| D2 | **Build all courses UP to the OmniStudio bar** (exams + checks + certificate = the minimum for a sellable course), not trim. | B-07 and B-25 flip from scope-trim to **build-out**. Interim completion-record state on the cert page until exams land. |
| D3 | **Course cadence stays daily** — no change. Only the **presentation** changes: show the final target count + "coming soon" for unwritten lessons. | B-01 / B-04 re-scoped to presentation-only (target count + coming-soon), not scope changes. |
| D4 | **Newsletter: nothing to wire yet.** | B-11 = **remove both dead forms** (S). Revisit when an ESP exists. |
| D5 | **Analytics: Google Analytics (GA4) baseline.** Build missing features into the admin panel later as needed. | B-06 = GA4 + CSP `connect-src`. In-house tracker deferred to admin-panel phase. |
| D6 | **adroit.io domain: hold entirely.** Wiring happens at the site merge with the adroit.io codebase, very soon. | **B-02 is parked/deferred past this version** — no code change now. |

---

## Executive summary

Three parallel discoveries (content/IA, visual/UX, technical) converge on the same picture: **the site is healthy and well-built, but it has trust-eroding inconsistencies, a broken flagship journey, and no measurement.**

- **Strong:** build clean (410 static pages, 0 warnings), 384/384 tests pass, 0 npm audit vulns, strong CSP, mature token system, brand applied consistently (slop score 0/10).
- **Broken:** the certify journey 404s for 6 of 7 series — the site's flagship promise ("tracked to completion", certificates) delivers a dead end for most of the catalog. **Decision: build every course up to the Omni bar.**
- **Confusing:** progress labels contradict themselves, course copy underrepresents real (target) scope, the hub advertises a Tracks section that never renders. **Decision: show final target + coming-soon; track renders as coming-soon placeholders.**
- **Unmeasurable:** zero web analytics anywhere. **Decision: GA4 baseline now.**
- **Unlaunched:** every canonical/sitemap/OG URL targets `adroit.io`. **Decision: hold — wired at the site merge, not in this version.**

After de-duplication (4 cross-discovery overlaps merged), the backlog is **27 items**: **17 quick wins** (S effort, safe to ship in any order) and **10 feature/major items**, the capstone of which is the **Constellations + Chronicle** achievement feature. Three new workstreams were added by the consultation: **course build-out to Omni bar**, **course ROI enhancements**, and the **post→course ad-card system**. See the phase map below for what's in and what's left over.

---

## De-duplication map (overlaps merged)

| Merged item | Sources |
|---|---|
| B-02 Canonical domain launch gate | Lois #9 + Brainiac #2 |
| B-08 Server-render /blog listing | Lois #10 + Brainiac #3 + Brainiac #9 (48 KB bundle rides on it) |
| B-03 Branded 404 page | Kara #2 + Lois #11 (journey context: 404s are a frequent destination right now) |
| B-04 Lesson-count overpromises + lint guard | Lois #3 + Kara #8 (card badge vs description) |

---

## Bucket 1 — Quick wins (S effort)

Obvious, safe, shippable now. Impact × effort ranked highest first.

| ID | Item | Theme | Impact | Effort | Source | Notes |
|---|---|---|---|---|---|---|
| B-01 | Fix series-hero progress-label contradiction ("Lesson 22 of 22" next to "0 of 22 complete") | Visual/UX | High | S | Kara #1 | **D3:** relabel to final target + coming-soon, e.g. "Lesson 28 of 90 · more coming soon". One label + copy. |
| B-02 | Resolve canonical-domain mismatch at launch | Technical (launch gate) | High | S–M | Brainiac #2 + Lois #9 | **D6: PARKED/DEFERRED.** No code change now — code is correct for the target domain. Wired at the adroit.io site merge. |
| B-03 | Branded 404 page (navy/red display moment + 3 CTAs: Back to blog, Browse Learn, Contact) | Visual/UX | High | S | Kara #2 + Lois #11 | 404s are a frequent destination today (6/7 series cert pages, deep learn URLs). Learn CTA goes to the hub. |
| B-04 | Fix lesson-count overpromises + add lint guard | Content | High | S | Lois #3 + Kara #8 | **D3:** re-scoped to show FINAL TARGET count + "coming soon" (not trim). Lint guard compares `description` claim vs `targetLessons` once targets are canonical. |
| B-05 | Make empty progress affordances visible ("Not read yet" pill, empty rings, lesson checkboxes, locked exam bar) | Visual/UX | High | S | Kara #3 | Visible track + readable label in both modes; filled state stays red accent. |
| B-06 | Wire web analytics | Analytics | High | S | Brainiac #1 | **D5: Google Analytics (GA4)** + CSP `connect-src`. In-house tracker / funnel events deferred to admin-panel phase. |
| B-07 | Certificate page for exam-less series | Content/IA | High | S–M | Lois #1 | **D2:** not a trim — build exams UP. Interim: render a "completion record / exam coming soon" state instead of a bare 404 while exams are authored. |
| B-08 | Server-render /blog listing (SSG first page + client filter island); bump 4/page → 8/page | Technical | High | M* | Brainiac #3 + Lois #10 + #9 | *M effort, listed here because it is a contained, safe refactor that fixes LCP/CWV and drops the 48 KB posts.ts from the client chunk. Ride-along. |
| B-09 | Guest /profile: locked-preview value demo with one real "Sign in or create account →" CTA to /login?next=/profile | Visual/UX | Med | S–M | Lois #8 | Turns a wall of 12 dead "Sign in" strings into the members value demo; doubles as the constellation "locked sky" teaser. |
| B-10 | Hermes track "coming soon" cards so the Tracks section renders | Content/IA | High | S–M | Lois #2 | **D1: IN SCOPE.** Track launches. Build placeholder cards for pending courses. **Access-aware:** pending+granted hidden externally (visible only to granted); other Access models render publicly. |
| B-11 | Newsletter: remove both dead forms | Content/IA | Med | S | Lois #5 | **D4: remove** both footer + categories forms. Dead forms burn trust. Revisit when an ESP exists. |
| B-12 | Sitemap lastmod: use content-derived dates; omit for hub pages | Technical | Med | S | Brainiac #6 | Kills per-deploy re-crawl churn. |
| B-13 | Per-post OG images (use post.bannerImage when present, else default card) | Technical | Med | S | Brainiac #7 | Lifts social CTR; pairs with analytics share events (B-06). |
| B-14 | Add /learn (and optionally /tags) to header nav | Technical | Med | S | Brainiac #8 | Learn has no header link — internal-linking and discoverability gap. |
| B-15 | Sitemap: emit only tags with ≥3 posts; "Browse all tags" disclosure on /tags | Technical | Low | S | Lois #7 (sitemap half) | 176 one-post thin tag pages dilute crawl budget. Tag vocabulary curation is the M-sized companion (B-22). |
| B-16 | Visual consistency micro-fixes: avatar geometry, "Mark complete" label grouping, zero-count pills, static exam badges, cert "not started" icon, footer light/dark policy | Visual/UX | Low | S (bundle) | Kara #5, #6, #9, #10, #11, #12 | One small polish pass; each item is a token/class tweak. |
| B-17 | Lift dark-mode contrast on secondary metadata (post tag pills, date/read-time, share icon strokes) | Visual/UX | Med | S–M | Kara #7 | Audit small text/icons against --ink-muted/--ink-faint; lift anything below ~4.5:1. |

---

## Bucket 2 — Feature / major work

| ID | Item | Theme | Impact | Effort | Source | Notes |
|---|---|---|---|---|---|---|
| B-18 | **Constellations + Chronicle achievement feature** (visual layer on the data foundation below) | Constellations | High | L | Kara (immersion map) + Lois #12 + Brainiac #5 | See dedicated section below for the full feature-definition inputs. Elevation of the static stub at commit 780fe81, not reuse. |
| B-19 | Constellations data foundation: widen completion_events.event_type CHECK (quiz/exam/certificate + optional metadata jsonb), add write sites (quiz-run, exam-pass, certificate-eligibility), fix unused-`now` streak bug (live streak, 0 if last activity not today/yesterday), add rank derivation | Constellations | High | M | Brainiac #5 | Migration 010 + 3 write sites + streak fix + rank. Must land before B-18's streak/rank surfaces are trustworthy. |
| B-20 | Post → Learn funnel + **ad-card pitch system**: an automated audit cross-references blog posts against courses as they arrive and injects a pitch card (e.g. Salesforce Architecture article → Salesforce course card). Plus related-posts row (same category, 3 cards) | Content/IA | High | M | Lois #4 + **Chris (2026-09-01)** | **NEW, flagship of Phase 3.** Context-aware ad-card wired into the Jimmy content pipeline. Reuse hub series-card component. |
| B-21 | Client-side site search over posts.ts + learn.ts (header search icon → results overlay grouped by post/series/lesson) | Content/IA | Med | M | Lois #6 | Both datasets are static imports — no backend needed. 63 posts + 109 lessons are browse-only today. |
| B-22 | Tag vocabulary curation: cap ~40 tags, merge synonyms (content task) | Content | Med | M | Lois #7 (curation half) | Companion to B-15 (sitemap filter). |
| B-23 | Learn rendering + proxy split: SSG/ISR public (non-gated) lessons with client-side access gate; proxy skips auth.getUser() when no session cookie | Technical | Med | M | Brainiac #4 | Makes Learn content CDN-cacheable; removes a DB round-trip from every page load. Tradeoff-aware: gated lessons stay dynamic. |
| B-24 | Mobile filter toolbar rework: category pills → single scrollable chip row, read/sort into compact toolbar, tighten H1 | Visual/UX | Med | M | Kara #4 | 7 pills + 2 toggle groups stack into a wall above content at 390px. |
| B-25 | **Course build-out to Omni bar** — exams (exam.json + tier checks) + certificate for all 6 non-omni series | Content | High | L (per series) | Lois #1 + **Chris (D2)** | The quiz/check tooling exists — omni proves the shape. Omni bar = minimum for a sellable course. Series by series. |
| B-26 | Constellation entry-point surfaces beyond the P1 set: track-page 3-star constellation once Hermes track is live; optional blog reading mini-constellation | Constellations | Med | M | Lois #12 + Kara (P3) | Track surface is the only place "track" completion is visible. Blog mini-constellation is optional/P3. |
| B-27 | Hermes Consultant track launch (placeholders + access-aware rows + level-page value props) | Content/IA | Med | M | Lois #2 + #13 | **D1: IN SCOPE.** Track launches. Pending+granted hidden externally; other Access models visible. |
| B-28 | **Course structure + creation standards (folds all ROI enhancements INTO course scaffolding)**: verifiable certificate (unique ID + public verify / LinkedIn-ready graphic), hands-on exercises per lesson, exam-readiness score + timed practice exam, capstone deliverable per course, cheat sheet / reference card, prereq + outcome mapping | Content/UX | Med–High | M–L | Kelex (2026-09-01) | **NEW (2026-09-01 rev 2):** Chris approved folding ALL enhancements into course structure/creation and delegating to the appropriate teams — they are part of the course scaffold, not a bolt-on phase. Owned by BA (structure/spec), Designer (visual), Developer (infra), + content writers. See course-enhancement section below. |

---

## Course structure + creation standards — the Omni bar and beyond (D2 / new)

**D2 mandates Omni parity as the floor.** Per Chris (2026-09-01), all enhancements below are folded **into the course structure and creation pipeline** — they are part of the scaffold every new/existing course is built against, delegated to the appropriate teams (BA: structure/spec · Designer: visual · Developer: infra · content writers: lessons). Beyond Omni parity, these raise perceived value and buyer ROI:

1. **Shareable, verifiable certificate** — unique cert ID + public verify link (or LinkedIn-ready graphic). Turns "certificate of completion" into a real credential people will show. High value, low effort once cert infra exists.
2. **Hands-on exercises per lesson** — a "practice / apply it" block with a working artifact or downloadable answer key. The difference between reading a course and doing it — the biggest ROI jump for a buyer.
3. **Exam-readiness score + timed practice exam** — beyond tier quizzes: a simulated full exam with a score gauge and "what to review" breakdown. Matches how people actually prep for certs.
4. **Capstone deliverable per course** — a real project/output the learner produces (e.g. the architect's solution doc, the consultant's engagement plan). A takeaway to show an employer.
5. **Cheat sheet / reference card** — generalize the AI-at-Work "one-page cheat sheet" to every series. High perceived value, cheap to produce.
6. **Prereq + outcome mapping** — "what you'll know after" and "you should take X first". Reduces buyer doubt, lifts completion.

**Recommended ROI sequence:** verifiable certificate → hands-on exercises → exam-readiness score → capstone → cheat sheet → prereq/outcome mapping.

---

## Constellations + Chronicle — feature definition inputs

Consolidated from all three discoveries. This section is the self-contained input for the feature spec and build.

### What the feature is

A branded achievement layer: each course is a **constellation** (connected stars, one per lesson, lit as completed), each track is a larger pattern, and a **Chronicle** (narrative completion log) plus streak/rank stats sit alongside. The design direction already exists as a static stub — commit `780fe81`, `design/t_cffa75b8/mockups/mockup-chronicle-constellation-seam.html` — which defines the token set (`--constellation-star` #4FC3F7, `--constellation-star-lit` red, `--constellation-line`, `--chronicle-streak`, `--chronicle-rank-ladder`). **The stub is a direction artifact to be elevated, not shipped** — the real implementation is a React component driven by `useProgressSummary`/`deriveProgress`.

### Where it surfaces (merged from Kara's immersion map + Lois's entry-point ranking + Brainiac's wow list)

| Priority | Surface | Route / component | What it shows |
|---|---|---|---|
| P1 | Lesson-complete moment | `/learn/[series]/[slug]` (LessonCompleteProgress, MarkComplete) | The wow moment: star "ignition" pop + brief constellation pulse + streak counter at the exact habit-loop beat |
| P1 | Series outline | `/learn/[series]` (SeriesSyllabus) | Full course constellation (lesson = star, lit as completed) + Chronicle of recent completions beside it |
| P1 | Learn hub | `/learn` (LearnHub) | Per-course constellation preview in card header (replaces/augments the flat gradient); keep light — the hub is a discovery surface |
| P2 | Profile | `/profile` (CertificateSection) | The full sky: aggregate constellations, streak, rank ladder, Chronicle feed. Guest version = "locked sky" teaser (pairs with B-09) |
| P2 | Certificate | `/learn/[series]/certificate` | Earned-certificate celebration: constellation completes + certificate reveal. **Enabled by B-07 interim state + D2 build-out** |
| P3 | Blog reading | `/blog` + post (BlogReadProgress) | Optional mini-constellation for the "N of M posts read" track |
| Later | Track pages | Hermes track (when live, B-27) | 3-star track constellation, Level 1→2→3 lights per level — the only surface where track completion is visible |

**Chronicle placement (all three agree):** the Chronicle lives on the profile, fed by the same completion events. No new IA surface needed.

### What data it needs

**Already available (no schema change for the visual layer):** `deriveProgress` (`src/lib/completion.ts`) yields `lessonsCompleted`, `coursesCompleted`, `tracksCompleted`, `streakDays`, `longestStreakDays`, `timeToCompleteDays` — sufficient for lesson/course/track constellations, streaks, and time-to-complete.

**Gaps to close first (B-19, migration 010 + 3 write sites):**
1. `completion_events.event_type` is `CHECK (lesson|course)` only — quiz/exam/certificate events are not in the log (quiz progress lives in `quiz_attempts`/`quiz_runs`, certificates are derived on-demand from exam runs, blog reads in `read_progress`). Widen the CHECK to include `quiz`/`exam`/`certificate` (+ optional `metadata jsonb` for tier/score).
2. `appendCompletionEvent` is called only from `/api/progress/lesson` — add write sites in the quiz-run and exam-pass handlers and the certificate-eligibility path.
3. **Streak bug:** `CompletionInput.now` is accepted but never used — "current streak" is the run ending at last activity, not live-as-of-today (a user idle 5 days still sees their old streak). Fix: compute relative to injected `now` (0 if last completion not today/yesterday); add a test with last-event < now. The lesson-complete streak counter (P1 surface) displays stale data until this lands.
4. **Rank:** `DerivedProgress` has no rank field (the "rank ladder" exists only in comments). Add a rank derivation (e.g. bands over coursesCompleted/lessonsCompleted) if the ladder ships.

### Design direction (from Kara)

- Surface type: Monitor (watching progress change) with a celebration moment on completion. Density + glanceability, not marketing.
- Motion: star ignition pop on completion (reuse the existing `check-pop` spring `cubic-bezier(0.34,1.56,0.64,1)`), subtle connecting-line draw, brief constellation pulse on course completion. Respect `prefers-reduced-motion` (global block already handles it).
- Tokens: keep the stub's additive token set — brand-safe.
- Do NOT reuse the stub's static HTML as the shipped component.

### Build sequence (recommended)

1. **B-19** (data foundation) — streak fix + event types + write sites + rank. Land first.
2. **B-18 P1 surfaces** — lesson-complete moment, series outline, hub preview.
3. **B-18 P2 surfaces** — profile full sky (+ locked-sky guest teaser via B-09), certificate celebration (enabled by B-07 interim + D2 build-out).
4. **B-26** — track constellation (gated on B-27), optional blog mini-constellation.

---

## Recommended sequence — INCLUDED vs LEFT OVER

| Phase | Items | Status | Why / decisions |
|---|---|---|---|
| 1. Quick-win sprint | B-01, B-03, B-04, B-05, B-06, B-12, B-13, B-14, B-15, B-16, B-17 | **IN — Wave 1** | All S, safe, independent. Fixes "reads as a bug" trust issues; turns on measurement (GA4). B-01/B-04 presentation-only per D3. |
| 2. Trust/truth fixes | B-07 (interim cert state), B-09, B-10, B-11, B-27 | **IN** | Journey + copy truthfulness. B-07 interim state + B-10/B-27 placeholders per D1/D2. B-11 = remove per D4. |
| 3. Funnel + navigation | B-20 (ad-card system), B-21, B-22, B-24, B-23 | **IN — flagship is the ad-card system** | Read → Learn conversion via automated post→course ad-cards (Chris 2026-09-01). |
| 4. Constellations foundation | B-19 | **IN** | Schema + write sites + streak fix + rank. Must precede the visual build. |
| 5. Constellations + Chronicle build | B-18 (P1 → P2), then B-26 | **IN** | The capstone feature. |
| 6. Course structure + creation (Omni bar + enhancements) | B-25 (exams to Omni bar, series by series), B-28 (enhancements folded into course scaffold) | **IN — content-heavy, parallel at team cadence** | Omni bar is the minimum for a sellable course (D2); enhancements are part of the scaffold (Chris 2026-09-01). Series order TBD — suggest most-sellable first (Omni done; then Salesforce System Architect, then agentic). |
| 7. Launch gate | B-02 | **PARKED / DEFERRED** | Wired at the adroit.io site merge, not in this version (D6). No code change now. |
| Ride-along | B-08 (SSR /blog) | **IN — Wave 1 parallel** | Contained refactor; also trims the client bundle. |

**LEFT OVER / DEFERRED beyond this version:**
- **B-02 (launch gate)** — parked per D6; adroit.io wiring happens at the site merge.
- **In-house analytics + funnel telemetry** — deferred; GA4 baseline now (D5), build missing features into the admin panel later if needed.
- **Newsletter ESP wiring** — deferred; forms removed until an ESP exists (D4).
- **Cadence change to at-once course completion** — not taken (D3); daily cadence stays, presentation only. Reversible later if a course must sprint-complete for launch.

---

## Handoff note

To the architect (Brainiac — web lane): the `requirements`-equivalent source of truth for execution is this backlog. The item that shapes the constellation build is the **Constellations + Chronicle** section above — it is self-contained (surfaces, data, design direction, sequence). B-19 is the prerequisite migration task; B-18 is the feature build. Everything in Bucket 1 is independently shippable. The **post→course ad-card system (B-20)** is the Phase-3 flagship and needs its own decomposition (content-mapping table + Jimmy-pipeline hook + card component).

**Counts:** 27 original items + 1 added (B-28) = 28. 17 quick wins (Bucket 1) · 11 feature/major (Bucket 2). 1 parked/deferred (B-02). 0 open questions — all resolved by the 2026-09-01 consultation.
