# Constellations + Chronicle — Design Brief (DISCOVERY)

**Task:** t_498437c7 (discovery) · **Author:** kara (designer) · **Date:** 2026-09-01
**Tenant:** adroit-blog · **Backlog:** B-18 (feature) over B-19 (data foundation)
**Parent arch:** t_3919afe1 — `docs/system-architecture-constellations.md` + `src/shared/contracts-constellations.ts`
**Downstream execution:** t_65e26fdd (composes full-fidelity mockups from this brief)
**Status:** DISCOVERY ONLY — direction + tokens + concept. The execution task builds the final mockups.

This brief is the source of truth for the design execution task. It maps every visual
decision onto the arch contract types (`ConstellationStar/State`, `AchievementStats`,
`Rank/RankBand/LadderProgress`, `ChronicleEntry`, `ProfileSky`, the P1/P2 component props).

---

## 1. Surface Archetype (committed before tokens)

> **This is a Monitor surface** — the learner is *watching their learning progress accrue*,
> with a single celebration overlay at the exact habit-loop beat (the ignition moment).
> Density and glanceability beat a marketing hero; the "hero" here is a data sky, not copy.

| Surface | Archetype | Why |
|---|---|---|
| Lesson-complete ignition (P1) | **Decide/Learn moment inside Monitor** | The one place a centered celebration is earned — the wow beat. Primary surface is still Monitor; the overlay is the transient motivator. |
| Series outline constellation (P1) | **Monitor** | Watching course progress accrue as lit stars. |
| Hub constellation preview (P1) | **Explore** (glanceable Monitor element) | Hub is a browse surface; the preview is a compact progress glance, never a full Chronicle. |
| Profile full sky (P2) | **Monitor** (aggregate) | The whole learning record read at a glance: constellations + streak + rank + Chronicle. |
| Chronicle feed (P2) | **Monitor** (timeline) | A narrative record of what was completed, when. |
| Certificate celebration (P2) | **Decide/Learn moment** | Earned completion reveal — a designed finish line. |

**Rule for the execution task:** do NOT give the profile sky a marketing hero + three feature
cards. It is a data surface — the "hero" is the starfield itself.

---

## 2. One-Line Direction

> **"You are a star-seeker charting a night sky."** Every course is a constellation — one
> star per lesson, ignited one at a time (dim icy-blue pinprick → red burning star). Your
> learning record is the **Chronicle**; your mastery is the **rank ladder** climbing from
> *starseed* to *celestial*. The canvas is the deep-navy sky of the Fortress of Solitude.

The conceptual anchor is **Kryptonian science → ignition**. Icy-blue crystal glow (`#4FC3F7`,
the Fortress ice) = available/unlit. Brand red (`#C8102E`, the DC-lore accent) = a star
ignited. The cold-to-fire transition is the whole emotional arc of the feature: reading a
lesson *ignites a star*. That maps 1:1 to the rank bands the arch already defined
(`starseed → wayfarer → explorer → polestar → celestial`).

**What is NOT changed:** the shipped navy/red palette, Inter stack, mono kickers, rounded-xl
cards, category gradients, and the existing `check-pop` spring are all kept. This layer is
**additive** — a new visual vocabulary (stars, lines, sky, magnitudes) on the existing system.

---

## 3. Design tokens (additive, dark-safe)

Full draft in `design-tokens-constellations.css`. Additive on the shipped semantic system in
`src/app/globals.css` + `design/design-tokens.css` + the learn-v2 tokens
(`design/t_cffa75b8/design-tokens-learn-v2.css`). NOTHING replaces shipped tokens. Every
token ships an `html.dark` remap.

### 3.1 The star (the unit of progress)
| Token | Light | Dark | Role |
|---|---|---|---|
| `--constellation-star` | `#4FC3F7` | `#7DD3FC` | Unlit-but-available star (icy blue) — "the next star you can light" |
| `--constellation-star-lit` | `#C8102E` (brand red) | `#F05066` | Ignited/completed star |
| `--constellation-star-locked` | `rgba(79,195,247,0.15)` | `rgba(125,211,252,0.16)` | Locked / future-gated star — a faint unborn pinprick, NOT icy-blue-bright |
| `--constellation-line` | `rgba(79,195,247,0.35)` | `rgba(125,211,252,0.40)` | Connecting rail between sequential stars |
| `--constellation-halo` | `rgba(200,16,46,0.18)` | `rgba(240,80,102,0.25)` | Radial glow behind a lit star (depth, not decoration) |
| `--constellation-current-ring` | `rgba(79,195,247,0.35)` | `rgba(125,211,252,0.45)` | Pulsing "you are here" ring on the current lesson's star |

### 3.2 The sky (profile full-sky canvas)
| Token | Light | Dark | Role |
|---|---|---|---|
| `--sky-bg` | `linear-gradient(160deg,#0B1D3A 0%,#132D54 55%,#0B1D3A 100%)` | deeper navy `#070B14→#0A0E1A` | Night-sky canvas for the full-sky section |
| `--sky-starfield` | faint white dots @ 0.5 alpha | faint white @ 0.6 alpha | CSS radial-gradient starfield texture |
| `--sky-ink` | `#fff` | `#F8FAFC` | Text on the sky canvas |
| `--sky-ink-muted` | `rgba(255,255,255,0.7)` | `rgba(248,250,252,0.7)` | Muted text on sky |

### 3.3 Chronicle + stats
| Token | Light | Dark | Role |
|---|---|---|---|
| `--chronicle-streak` | `#E11D48` (rose) | `#FB7185` | The streak number — the one warm "urgency" accent |
| `--chronicle-date` | `var(--ink-faint)` | `var(--ink-muted)` | Mono date stamps |
| `--chronicle-marker` | `var(--signal-done)` | `#34D399` | Chronicle entry dot (emerald = completed record) |
| `--chronicle-rank-ladder` | `var(--color-navy-light)` | `var(--ink-muted)` | Stepped rank-ladder list |

### 3.4 Rank bands → star magnitudes
The arch defines the ladder (`contracts-constellations.ts`). The DISCOVERY decision: **each
rank is drawn as a star of increasing magnitude** (1→5 points, brighter/higher as mastery
grows). Visual language, not copy — `deriveRank` in code owns the thresholds. The ladder UI
consumes `LadderProgress.ladder[]`, `current`, `nextProgressPct` from the contract.

| Band | Display | Star treatment |
|---|---|---|
| starseed | entry | 1-point faint star |
| wayfarer | 5 lessons | 2-point dimmer-cyan star |
| explorer | 20 lessons / 2 courses | 3-point ice-blue star |
| polestar | 50 / 4 | 4-point bright star + halo |
| celestial | 100 / 8 | 5-point full flare + strong halo |

---

## 4. Component specifications (mapped to the arch contracts)

Every component below reads its props from `src/shared/contracts-constellations.ts`.

### 4.1 `ConstellationCelebration` (P1 — lesson-complete ignition)
Props: `seriesSlug, courseName, lessonSlug, lessonLabel, litStars, totalStars, streakDays, courseJustCompleted, prefersReducedMotion`.
- **Composition:** centered modal/overlay sheet over the lesson page (transient, ~3s, or
  dismiss-on-click). Dark navy sky canvas, the single ignited star center-stage.
- **The ignition:** the star for this lesson scales `0 → 1.25 → 1` with the existing
  `check-pop` spring `cubic-bezier(0.34,1.56,0.64,1)`, blooming from icy-blue to red with a
  one-shot radial flare (`--constellation-halo`). Below it: mono kicker
  `CONSTELLATION · {courseName}`, the lesson label as display type, and a compact
  `StreakCounter` chip ("DAY 14" in `--chronicle-streak`).
- **Course complete (`courseJustCompleted`):** after the ignition, the full constellation of
  lit stars pulses in sequence (brief, ~1.2s) — the "constellation pulse." Label swaps to
  "Constellation complete."
- **Motion:** `check-pop` for the star; flare fades 400ms; pulse stagger 120ms. Respect
  `prefers-reduced-motion` (no scale/flare — a static lit state is shown).

### 4.2 `StreakCounter` (P1)
Props: `streakDays, variant: 'inline'|'stat'`.
- `inline` (lesson-complete chip): small rose pill — mono "DAY {N}" + a 4-point star glyph.
- `stat` (profile/stat strip): larger number in `--chronicle-streak`, label "day streak".
- Uses the *post-write* value from `GET /api/progress/achievement` (B-19 streak fix) — never a
  stale render.

### 4.3 `SeriesConstellation` (P1 — series outline, beside the syllabus)
Props: `constellation: ConstellationState, isGuest`.
- **Desktop:** a horizontally-flowing **connected path** of stars (lesson = star, sequential
  order), joined by `--constellation-line` rails. Each star: 14px round, three states
  (locked / in-progress / ignited), mono index label beneath, `aria-label={lessonSlug}` +
  `title` for a11y. Legend: Completed / In progress / Locked. Mono counter `{litStars}/{totalStars}`.
- **Guest (`isGuest`):** render the constellation with the current-lesson star unlit and a
  compact "Sign in to chart your course →" affordance beneath (pairs with B-09).
- **Mobile (≤375px):** connectors drop; the constellation becomes a **starfield grid**
  (wrapped dots, 4–5 per row). The current-lesson star keeps its `--constellation-current-ring`.
  The grid reads as a sky, not a broken path — connector omission is a feature at this size.

### 4.4 `ConstellationPreview` (P1 — hub card, keep LIGHT)
Props: `constellation, compact?: true`.
- Rendered into the existing `PathCard` gradient band header. A single row of small star dots
  (6px) + a mono `{lit}/{total}` counter. NO lines, NO labels, NO Chronicle. Replaces/augments
  the flat gradient — but stays a glance. The arch risk note is respected: the hub stays light.

### 4.5 `FullSkySection` (P2 — profile)
Props: `sky: ProfileSky`.
- **Hero canvas:** `--sky-bg` gradient + `--sky-starfield` texture. Mono kicker
  `YOUR SKY`, display headline (oversized — one typographic moment, e.g. the learner's rank
  name or total stars), optional editorial serif for the rank name (see §7 decision).
- **Aggregate constellations:** the grid of each course's constellation (compact previews) —
  the whole learning record as a starfield.
- **Stat strip:** streak (`stat` variant), lessons completed, courses completed — real
  `AchievementStats` numbers, never invented.
- **Rank ladder:** `--chronicle-rank-ladder` stepped list of `LadderProgress.ladder[]`,
  current band highlighted (accent inset + stronger star), progress bar to next band using
  `nextProgressPct`.
- **Chronicle feed:** `ChronicleFeed` (below).

### 4.6 `ChronicleFeed` (P2)
Props: `chronicle: ChronicleEntry[]`.
- Monitor timeline: each entry = emerald marker dot + `label` (primary) + course/sub text +
  mono `completedAt` date. Differentiated icons/dots per `eventType` (lesson/quiz/exam/
  certificate) — certificate rows get the red-star glyph. Scrollable panel, newest first.
- Empty state: "Your sky is still forming. Complete a lesson to light your first star." + CTA.

### 4.7 `LockedSkyTeaser` (P2 — guest)
Props: `ctaHref`.
- Same sky canvas, but the constellations render **locked** (dim pinpricks, no lit stars) with
  a soft blur/starfield overlay + one CTA "Sign in or create account →" → `/login?next=/profile`.
  Replaces the wall of dead "Sign in" strings (B-09).

### 4.8 `CertificateCelebration` (P2)
Props: `seriesSlug, courseName, constellation, streakDays`.
- Full constellation completes (all stars lit, one last ignition) → certificate reveal behind
  the celebration. The largest ignition moment — constellation pulse, then the printable
  certificate slides up. Red halo as the finish-line glow.

---

## 5. Component states (all components)

| State | Star visual | Meaning |
|---|---|---|
| **locked** | 6–8px dot, `--constellation-star-locked` (faint, no glow, no line) | Pre-req/future-gated lesson — unborn star |
| **in-progress** | 14px dot, `--constellation-star` (icy blue @ ~0.45) + `--constellation-current-ring` pulse | The lesson you're currently on / next to light |
| **ignited** | 14px dot, `--constellation-star-lit` (red) + `--constellation-halo` | Lesson completed |
| **loading** | 14px skeleton shimmer (existing `--space` shimmer) or static unlit | Data still fetching |
| **empty** | Starfield with 0 lit, editorial empty-state copy | No completions yet |
| **error** | Constellation renders unlit + inline retry (server down) | Failed fetch — never crash the page |

**Responsive:** desktop = connected path + ladder side-by-side. ≤375px = starfield grid
(no connectors), stat strip stacks to 1 column, Chronicle becomes full-width list. Hit targets
for any interactive star ≥44px on touch.

---

## 6. Motion & interaction notes (for steel)

- **Ignition pop:** reuse `check-pop` spring `cubic-bezier(0.34,1.56,0.64,1)` — star scales
  `0→1.25→1`, one-shot red flare 400ms.
- **Line draw:** on course complete, connecting rails `stroke-dashoffset` animate in
  (300ms stagger).
- **Constellation pulse:** on course complete, lit stars pulse in sequence (120ms stagger, ≤1.2s).
- **Streak:** count-up to the post-write value; rose color `--chronicle-streak`.
- All motion respects the global `prefers-reduced-motion` block (no transforms/flares).

---

## 7. Open decisions for the execution task (keep LOW-RISK)

1. **Display serif on the sky hero** — proposed: keep Inter for all UI, but allow ONE optional
   editorial serif (e.g. `Newsreader` italic) for the profile-sky rank-name display moment, to
   give the "night sky as a story" mythos without touching site chrome. RECOMMEND: adopt it
   only for the sky hero + certificate moment; verify it against the mono kicker contrast.
2. **Connector rails on mobile** — RECOMMEND drop them (starfield grid) per §4.3; confirm the
   starfield reads as intentional vs. broken.
3. **Chronicle event-type glyphs** — RECOMMEND: emerald dot for all, red-star only for
   `certificate`; keep quiz/exam as emerald with a score suffix in mono (`7/10`).

---

## 8. Anti-slop self-audit (this discovery)

- **1 Tech gradient:** NONE — sky is the deep-navy DC-lore navy, stars are brand red/icy blue. ✔
- **2 Generic tech hue:** NO — icy blue is the existing DC-lore `#4FC3F7` (Kryptonian ice), not indigo. ✔
- **3 Feature-tile grid:** NO — surfaces are data (Monitor), no icon+heading+sentence×3. ✔
- **4 Accent rail:** NO — rank ladder uses an inset star/accent but not a decorative left strip. ✔
- **5 Unearned blur:** NO glassmorphism on the core surfaces; the sky is a deliberate gradient canvas. ✔
- **6 Monument stat:** streak/rank numbers are real `AchievementStats`, shown once, not filling space. ✔
- **7 Icon topper:** NO — the star IS the data, not an icon above a heading. ✔
- **8 Center stack:** NO — the only centered moment is the ignition overlay (Decide/Learn beat). ✔
- **9 Default type:** Inter kept (existing brand); mono kickers chosen; optional serif is a decision. ✔
- **10 Wrong surface:** NO — Monitor surfaces, ignition overlay is the one earned Decide/Learn moment. ✔

**Slop score: 1/10** (only #9 partially fires — Inter is the established brand face, so it's a keep).

## 9. Wow-factor bar (this discovery sets the direction)

1. **Real imagery** — mood board assets (FAL) embedded in mockups, sky gradient + starfield texture. ✔
2. **Motion** — star ignition, line draw, constellation pulse, streak count-up, reduced-motion respected. ✔
3. **Depth** — `--constellation-halo`, sky gradient, starfield texture, layered elevation. ✔
4. **Typographic scale** — oversized sky display + mono kicker contrast. ✔
5. **Craft details** — consistent star/space/radius system, a11y labels, states on everything. ✔
6. **Signature element** — the **star-ignition moment** (icy pinprick → red flare) is the
   memorable component, plus the full-sky starfield. ✔
**Bar: 6/6** for the direction; the execution task must hold ≥4/6 on every final mockup.

---

## 10. Handoff to execution (t_65e26fdd)

- **Files this brief points at:** `direction-brief-constellations.md` (this),
  `design-tokens-constellations.css`, `mockups/mockup-constellations-chronicle.html`,
  `moodboards/*.png` (3 FAL images).
- **Contract alignment:** every component name/type above is exactly
  `contracts-constellations.ts`. Do not rename. Use `RankBand`/`Rank`/`LadderProgress` for the
  ladder (NOT the stub's R6–R10).
- **Correction to the old stub:** the prior `mockup-chronicle-constellation-seam.html` used
  `R6–R10 Apprentice→Principal`. The arch's real bands are `starseed→celestial`. The execution
  task MUST adopt the arch bands and map star magnitudes to them (§3.4).
- **Deliverables expected from execution:** full-fidelity mockups (desktop + 375px) for each
  surface, final tokens, and a `reports/design-system.html` — then handoff to **steel**.
