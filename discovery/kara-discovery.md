# Kara — Visual / UX Polish Discovery (adroit-blog)

**Date:** 2026-09-01 · **Tenant:** adroit-blog · **Scope:** Discovery/audit only — no implementation
**Repo:** `~/Documents/Fortress-of-Solitude/adroit-blog` · **Live:** `https://adroit-blog-two.vercel.app`
**Role:** Kara (Designer) — visual consistency, dark/light, motion, mobile, brand polish, immersion mapping
**Method:** Live-site browser inspection (desktop + 390px mobile, light + dark) with screenshots, plus repo source review of tokens (`src/app/globals.css`), components, and the V2 constellation stub (commit `780fe81`).

---

## Executive summary

The site is **visually strong and well-tokenized** — the navy `#0B1D3A` / red `#C8102E` brand is applied consistently, the semantic token system (`--surface-*`, `--ink-*`, `--accent-*`) is mature, dark mode is a proper token remap (not a bolt-on), and reduced-motion is respected globally. The Learn platform (hub, series, lesson, quiz, exam, certificate) is the most polished surface family on the site.

The **highest-impact polish gaps are not "broken" — they are "confusing" and "under-considered"**:

1. **A progress-label contradiction** on every series hero: a brand-new user sees **"Lesson 22 of 22"** next to **"0 of 22 complete" / "0%"**. `LessonProgress` renders `published` (a *content* metric — how many lessons exist) as if it were the user's position. Reads as a bug even though it's intentional.
2. **The 404 page is the bare Next.js default** — no branding, no CTA, no way back. Jarring against an otherwise polished site.
3. **Low-contrast "empty" affordances** — the "Not read yet" status, empty progress rings, and lesson checkboxes are so faint they're nearly invisible in both modes.
4. **Mobile filter density** — 7 category pills + read/sort toggles stack into a tall wall above content on 390px.
5. **The V2 Constellation + Chronicle visual is a stub** (commit `780fe81`) that maps cleanly onto `completion_events` — the entry points are clear and the data model already supports it, but it needs elevation, not reuse.

Findings are ranked by impact. Each includes evidence, why it matters, a proposed fix, and effort (S/M/L).

---

## HIGH impact

### 1. Series hero progress label contradicts itself — "Lesson 22 of 22" + "0 of 22 complete" + "0%"
- **Evidence:** Live `/learn/omni-studio-cert` and `/learn/salesforce-architect` (screenshot `series-omni-light.png`). Hero shows center label **"Lesson 22 of 22"**, left **"0 of 22 complete"**, right **"0%"**, empty bar. Source: `src/components/Learn/LessonProgress.tsx:45` renders `Lesson <b>{published}</b> of {total}` where `published` = number of *published lessons* (a content metric), while `SeriesProgress` (`src/components/Progress/SeriesProgress.tsx:45`) renders the *user's* `done of total complete`. The two labels sit in the same hero block and contradict.
- **Why it matters:** A first-time visitor reads "Lesson 22 of 22" as "you're on lesson 22" — but they've done nothing. It looks like a data bug and erodes trust in the progress system, which is the site's core differentiator.
- **Proposed fix:** Re-label the content metric. Either (a) change `LessonProgress` to read **"22 lessons"** / **"22 published"** (drop the "of" framing that implies position), or (b) make it the user's position ("You're on lesson 1 of 22") when authenticated. The cleanest: keep `LessonProgress` as a *published-content* bar but label it "22 lessons · published", and let `SeriesProgress` own the user-progress "N of M complete" line. Do not show both with the same "of" grammar.
- **Effort:** S (one label string + copy).

### 2. 404 page is the bare Next.js default — no brand, no CTA
- **Evidence:** Live `/nonexistent-page` (screenshot `404-default.png`). Centered "404 | This page could not be found." on a flat dark background. No logo, no "Back to home", no search, no link to Learn. Source: no custom `not-found.tsx` in `src/app/`.
- **Why it matters:** Every dead link, mistyped URL, and deleted post lands here. It's the one page that looks completely unowned — a visible "amateur" tell on an otherwise polished site, and it traps users (no way forward).
- **Proposed fix:** Add `src/app/not-found.tsx` using the existing Header/Footer + brand tokens: a navy/red "404" display moment, a short line, and 2–3 CTAs (Back to blog, Browse Learn, Contact). Reuse the `hero-fade-in` motion. This is a small, high-visibility win.
- **Effort:** S.

### 3. "Empty" progress affordances are too faint to read in both modes
- **Evidence:** Blog post "Not read yet" status + empty progress ring (`blog-post-dark.png`, `blog-post-light.png`); lesson "Mark complete" empty circles (`series-omni-light.png`); exam locked "0/9" bar (`exam-locked-light.png`). All render as very light gray on light gray / dark gray on dark — the vision pass flagged each as "barely visible."
- **Why it matters:** These are the *interactive* signals of the progress system. If the empty state is invisible, users don't know the control exists, and the "0%" state reads as broken rather than "not started."
- **Proposed fix:** Give empty progress states a visible track (a `--border-strong` outline or a faint-but-present fill) and a readable label. For the "Not read yet" pill, bump the text to `--ink-muted` and give the ring a visible stroke. Keep the *filled* state the red accent so the contrast between empty/filled is obvious.
- **Effort:** S (token/class tweaks across `ProgressIndicator`, `MarkComplete`, `BlogReadProgress`).

---

## MEDIUM impact

### 4. Mobile: category filters + read/sort toggles stack into a tall wall above content
- **Evidence:** Live `/blog` at 390px (screenshot `mobile-blog-light.png`). The 7 category pills wrap into ~4 stacked rows, then the All/Unread/Read segmented control and Newest/Oldest toggle stack below — all before the first post card. The hero H1 also wraps to 3–4 lines.
- **Why it matters:** On mobile the filter chrome consumes most of the first viewport, pushing content far down. It's functional but feels heavy and unconsidered at small widths.
- **Proposed fix:** On mobile, collapse the category pills into a horizontally scrollable chip row (single line, `overflow-x-auto`, no wrap) and/or move the read/sort toggles into a compact toolbar. Consider a "Filters" disclosure. Keep the H1 but tighten its mobile size.
- **Effort:** M (layout rework of the listing toolbar).

### 5. Avatar shape inconsistency: header is rounded-square, profile is a different rounded-square
- **Evidence:** Header avatar `rounded-[10px]` (`src/components/Header.tsx:173`, `AvatarMenu.tsx:267`); profile identity avatar `rounded-2xl` (`src/app/profile/page.tsx:88`). Both are "rounded squares" but with visibly different corner radii and sizes (h-10 vs h-16).
- **Why it matters:** Minor, but it's exactly the kind of "things that are off" the user is hunting — the same identity renders with different geometry in two places.
- **Proposed fix:** Standardize on one avatar token (e.g. `--radius-avatar: 10px` or a shared `Avatar` component) used by header, menu, and profile.
- **Effort:** S.

### 6. "Mark complete" label is detached from its control
- **Evidence:** `src/components/Learn/SeriesSyllabus.tsx:106-111` — the "Mark complete" text is left-aligned in a row while the `MarkComplete` circle sits far right (`justify-between`). Vision pass flagged the label as "floating" with no clear association to the checkbox.
- **Why it matters:** The label and control read as unrelated; users may not realize the circle is the toggle. It's a small alignment/affordance smell.
- **Proposed fix:** Put the label adjacent to the control (label + circle grouped on the right), or make the whole row the toggle with the circle as the visual state.
- **Effort:** S.

### 7. Dark mode: secondary tags, metadata, and share icons are low-contrast
- **Evidence:** `blog-post-dark.png` — the post's secondary tags ("AI Strategy", "Digital Transformation"), the date/read-time metadata, and the share icons are dim against the dark surface. The `html.dark` remap covers body/headings/links but these small elements fall through to faint grays.
- **Why it matters:** Readability of supporting metadata is the residual dark-mode gap (the known a11y fixes addressed the worst cases; this is the next tier).
- **Proposed fix:** Audit small text/icons in dark mode against `--ink-muted`/`--ink-faint` and lift the ones that fall below ~4.5:1. Specifically the post tag pills and share icon strokes.
- **Effort:** S–M.

### 8. Course card copy contradicts the lesson-count badge
- **Evidence:** `/learn` hub (screenshot `learn-hub-light.png`): Salesforce card badge "27 / 27 lessons" but description says "A **90-lesson** deep dive"; OmniStudio "22 / 22 lessons" vs "A **46-requirement** deep dive"; Hermes L1 "6 / 6 lessons" vs "A **~30-lesson** path".
- **Why it matters:** The badge (published lessons) and the description (total planned scope) use different numbers with no explanation — reads as a data inconsistency.
- **Proposed fix:** Align the copy: either the badge should reflect the described scope, or the description should say "published daily" / "27 of 90 published" to reconcile the two numbers.
- **Effort:** S (copy).

---

## LOW impact / polish

### 9. "Marketing 0" category pill is clickable but empty
- **Evidence:** `/blog` filter row shows "Marketing 0" styled identically to populated categories. Clicking yields an empty listing.
- **Proposed fix:** Dim/disable zero-count categories (or hide them) so the filter row communicates real options.
- **Effort:** S.

### 10. Exam locked page: "80% required" badges look interactive but are static
- **Evidence:** `exam-locked-light.png` — the "80% required" pills have a button-like border/shape but are static status labels; the right-arrows on locked K1–K9 rows look like navigation but are just affordance.
- **Proposed fix:** Make locked rows visually "startable" (a real "Start" affordance) or de-emphasize the static badges so they don't read as buttons.
- **Effort:** S.

### 11. Certificate locked state uses aggressive "X" icons for "not started"
- **Evidence:** `/learn/omni-studio-cert/certificate` (dark) — each unmet requirement shows a circle with an "X", which reads as "failed" rather than "not yet done."
- **Proposed fix:** Use a neutral empty circle (or a dash) for "not started" and reserve the X for genuinely failed/expired states.
- **Effort:** S.

### 12. Footer is always dark even in light mode
- **Evidence:** `profile-light.png`, `blog-post-light.png` — the footer stays dark navy in light mode. This is a common deliberate pattern, but it's a mode inconsistency worth a conscious decision.
- **Proposed fix:** Either keep it (document as intentional) or give it a light variant. Not a bug — a decision to confirm.
- **Effort:** S.

---

## Immersion opportunity — Constellations + Chronicle (V2)

The existing stub at commit `780fe81` (`design/t_cffa75b8/mockups/mockup-chronicle-constellation-seam.html`) is a **Monitor seam** — a connected-star constellation (course = connected lessons, track = larger pattern) + a Chronicle completion list + streak/rank stats. It maps 1:1 to `completion_events` via `deriveProgress` (`src/lib/completion.ts`). It is a **stub to be elevated, not reused as-is** — it's a static HTML mockup with no motion, no celebration, and no real data wiring.

**Recommended entry points (where the V2 visual should live):**

| Surface | Route / component | What the visual adds | Priority |
|---|---|---|---|
| **Learn hub** | `/learn` (`LearnHub.tsx`) | Per-course constellation preview in each card header (replaces/augments the flat gradient) — the "connected stars" language starts here | **P1** |
| **Series outline** | `/learn/[series]` (`SeriesSyllabus.tsx`) | The full constellation for that course — each lesson a star, lit as completed; the Chronicle of recent completions beside it | **P1** |
| **Lesson complete moment** | `/learn/[series]/[slug]` (`LessonCompleteProgress.tsx`, `MarkComplete`) | **Celebration effect** — the star "lights up" with a pop + a brief constellation pulse on completion (the wow moment) | **P1** |
| **Profile** | `/profile` (`CertificateSection.tsx`) | Aggregate achievement: streak, rank ladder, total constellation across all courses, Chronicle feed | **P2** |
| **Certificate** | `/learn/[series]/certificate` | Earned-certificate celebration — constellation completes + certificate "unlocks" with a reveal | **P2** |
| **Blog reading** | `/blog` + post (`BlogReadProgress.tsx`) | Optional: extend the "N of M posts read" into a mini-constellation for the reading track | **P3** |

**Design guidance for the elevation (not a mockup — direction only):**
- **Surface:** Monitor (watching progress change) with a **celebration moment** on completion. Density + glanceability, not marketing.
- **Motion:** The stub has none. Add: star "ignition" pop on completion (reuse the existing `check-pop` spring `cubic-bezier(0.34,1.56,0.64,1)`), a subtle connecting-line draw, and a brief constellation pulse on course completion. Respect `prefers-reduced-motion` (the global block already handles it).
- **Tokens:** The stub already defines `--constellation-star` (icy blue `#4FC3F7`), `--constellation-star-lit` (red), `--constellation-line`, `--chronicle-streak`, `--chronicle-rank-ladder` — these are additive and brand-safe. Keep them.
- **Data:** `deriveProgress` already yields `lessonsCompleted`, `coursesCompleted`, `tracksCompleted`, `streakDays`, `longestStreakDays`, `timeToCompleteDays` — everything the constellation + chronicle + rank ladder needs. No schema change required for the visual layer.
- **Do NOT** reuse the stub's static HTML as the shipped component — it's a direction artifact. The real implementation should be a React component driven by `useProgressSummary`/`deriveProgress`.

---

## Slop self-audit (of the existing site, not a new design)

Scored against the 10-tell diagnostic to confirm the site is NOT sloppy (this is an audit, so a low score is good):
- Tech gradient: **no** (brand navy/red, category gradients are intentional) · Generic tech hue: **no** (red is the brand) · Feature-tile grid: **no** (cards carry real data) · Accent rail: **no** (red vertical bars are section markers, used sparingly) · Unearned blur: **no** (no glassmorphism) · Monument stat: **no** (progress numbers are functional) · Icon topper: **no** · Center stack: **no** (editorial left-aligned) · Default type: **no** (Inter chosen, mono accents) · Wrong surface: **no** (Learn = Monitor/Operate, blog = Decide/Learn, correct).
**Slop score: 0/10.** The site's issues are polish/consistency, not slop.

---

## Top improvements (ranked)

1. Fix the series-hero progress label contradiction (S) — reads as a bug.
2. Add a branded 404 page (S) — the one unowned surface.
3. Make empty progress affordances visible (S) — the progress system's core signals.
4. Mobile filter toolbar rework (M) — reclaim the first viewport.
5. Standardize avatar geometry (S) + fix "Mark complete" label association (S).
6. Lift dark-mode secondary metadata contrast (S–M).
7. Reconcile course-card copy vs lesson-count badge (S).

## Wow opportunities

- **Constellation + Chronicle V2** (P1): the connected-star progress visual with a completion celebration is the single biggest "wow" lever — it turns the existing progress system into a memorable, branded achievement layer. Entry points mapped above.
- **Branded 404** with a navy/red display moment + CTAs — small but makes the whole site feel owned.
- **Lesson-complete celebration** (star ignition + constellation pulse) — the micro-moment that makes progress feel rewarding.

---

## Evidence screenshots

All in `discovery/screenshots/`:
- `404-default.png` — bare Next.js 404
- `blog-post-dark.png` — dark-mode post (low-contrast secondary tags/metadata)
- `exam-locked-light.png` — locked exam (faint progress, static "80% required" badges)
- `learn-hub-light.png` — Learn hub (course-card copy vs badge mismatch)
- `lesson-quiz-light.png` — lesson quiz widget
- `mobile-blog-light.png` — 390px blog (filter wall)
- `mobile-learn-light.png` — 390px Learn hub
- `profile-light.png` — profile (avatar geometry, dark footer)
- `series-omni-light.png` — series hero (progress-label contradiction, faint checkboxes)
