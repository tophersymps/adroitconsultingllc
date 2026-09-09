# Constellations + Chronicle — Component Specs, Layouts & User Flows (EXECUTION)

**Task:** t_65e26fdd (execution) · **Author:** kara (designer) · **Date:** 2026-09-01
**Tenant:** adroit-blog · **Backlog:** B-18 (feature) over B-19 (data foundation)
**Source:** discovery brief `design/t_498437c7/direction-brief-constellations.md` +
arch contracts `src/shared/contracts-constellations.ts` (OWNED BY BRAINIAC — do not edit).
**Downstream:** steel builds B-18 from these specs + the mockups + `reports/design-system.html`.

---

## 0. Source-of-truth rule

Every component below reads its props from `src/shared/contracts-constellations.ts`.
**Component names MUST NOT be renamed.** The rank ladder is the arch's
`RankBand`/`Rank`/`LadderProgress` (starseed→celestial). Do NOT reuse the old seam
stub's `R6–R10 Apprentice→Principal` bands.

Final tokens: `design/t_65e26fdd/design-tokens-constellations.css`
(ADDITIVE — nothing replaces shipped tokens; every token ships an `html.dark` remap).

---

## 1. Surface archetype (locked)

> **Monitor** — the learner watches their progress accrue as lit stars. The single
> **Decide/Learn** celebration overlay is reserved for the ignition beat. Do NOT give
> the profile sky a marketing hero + three feature cards — the "hero" IS the starfield.

| Surface | Archetype |
|---|---|
| Lesson-complete ignition (P1) | Decide/Learn moment inside Monitor (transient overlay) |
| Series outline constellation (P1) | Monitor |
| Hub constellation preview (P1) | Explore (glanceable Monitor element — stays LIGHT) |
| Profile full sky (P2) | Monitor (aggregate) |
| Chronicle feed (P2) | Monitor (timeline) |
| Certificate celebration (P2) | Decide/Learn moment |

---

## 2. Design tokens (final — additive, dark-safe)

Full file: `design/t_65e26fdd/design-tokens-constellations.css`. Key additions over
the discovery draft:

- **`--font-display-serif`** (`Newsreader` italic) — ADOPTED for the sky-hero rank
  display + certificate only (open decision §7.1). Editorial contrast vs the mono
  kicker; never on site chrome.
- **`--chronicle-cert-glyph`** — red-star glyph for `certificate` Chronicle rows
  (open decision §7.3: emerald dot for all others, red-star only for certificate).
- **`cx-rank-display`** utility — gradient-clipped editorial serif rank name,
  flattened to solid `--sky-ink` under `prefers-reduced-motion`.
- **Touch target guardrail** — `.cx-star::after` extends the hit box to ≥44px for
  any interactive star (P1).

### 2.1 Star tokens (three states)

| Token | Light | Dark | Role |
|---|---|---|---|
| `--constellation-star` | `#4FC3F7` | `#7DD3FC` | unlit-but-available (icy blue) |
| `--constellation-star-lit` | `#C8102E` | `#F05066` | ignited/completed |
| `--constellation-star-locked` | `rgba(79,195,247,0.15)` | `rgba(125,211,252,0.16)` | future-gated pinprick |
| `--constellation-line` | `rgba(79,195,247,0.35)` | `rgba(125,211,252,0.40)` | connecting rail |
| `--constellation-halo` | `rgba(200,16,46,0.18)` | `rgba(240,80,102,0.25)` | lit-star glow |
| `--constellation-current-ring` | `rgba(79,195,247,0.35)` | `rgba(125,211,252,0.45)` | "you are here" pulse |

### 2.2 Sky + Chronicle + magnitudes

See token file §2–§4. Rank bands → star magnitudes (DISPLAY ONLY; thresholds in code):

| Band | lessons / courses | Star treatment |
|---|---|---|
| starseed | entry | 1-point faint (`--magnitude-1`) |
| wayfarer | 5 / – | 2-point dimmer-cyan (`--magnitude-2`) |
| explorer | 20 / 2 | 3-point ice-blue (`--magnitude-3`) |
| polestar | 50 / 4 | 4-point bright + halo (`--magnitude-4`) |
| celestial | 100 / 8 | 5-point full flare (`--magnitude-5`) |

---

## 3. Component specifications

### 3.1 `ConstellationCelebration` (P1) — star ignition
Props: `seriesSlug, courseName, lessonSlug, lessonLabel, litStars, totalStars,
streakDays, courseJustCompleted, prefersReducedMotion?`.
- Centered transient overlay sheet over the lesson page (~3s or dismiss-on-click).
- Ignition: star scales `0→1.25→1` via `check-pop` spring
  `cubic-bezier(0.34,1.56,0.64,1)`, icy-blue → red bloom + one-shot radial flare.
- Mono kicker `CONSTELLATION · {courseName}`, lesson label display type,
  `StreakCounter` chip (`DAY {N}` rose).
- `courseJustCompleted` → constellation pulse (lit stars in sequence, 120ms stagger,
  ≤1.2s); label swaps to "Constellation complete."
- Reduced-motion: static lit state, no scale/flare.

### 3.2 `StreakCounter` (P1)
Props: `streakDays, variant: 'inline'|'stat'`.
- `inline` — rose pill, mono `DAY {N}` + 4-point star glyph.
- `stat` — larger number in `--chronicle-streak`, label "day streak".
- Uses POST-write value from `GET /api/progress/achievement` (B-19 streak fix).

### 3.3 `SeriesConstellation` (P1) — series outline
Props: `constellation: ConstellationState, isGuest`.
- Desktop: connected path of stars (lesson = star, sequential), joined by
  `--constellation-line` rails. Each 14px star, 3 states, mono index label,
  `aria-label={lessonSlug}` + `title` for a11y. Legend + mono `{litStars}/{totalStars}`.
- Guest: render unlit current star + "Sign in to chart your course →" affordance.
- Mobile (≤375px): connectors drop → **starfield grid** (wrapped dots, 4–5/row).
  Current-lesson star keeps `--constellation-current-ring`. Reads as a sky, not a
  broken path.

### 3.4 `ConstellationPreview` (P1) — hub card, stays LIGHT
Props: `constellation, compact?: true`.
- Rendered into PathCard gradient band header: one row of 6px star dots + mono
  `{lit}/{total}` counter. NO lines, NO labels, NO Chronicle. Stays a glance.

### 3.5 `FullSkySection` (P2) — profile
Props: `sky: ProfileSky`.
- Sky canvas: `--sky-bg` + `--sky-starfield` + vignette. Mono kicker `YOUR SKY`,
  display headline (rank name in `--font-display-serif` italic gradient), rank sub.
- Aggregate constellations grid (compact previews) — the whole record as a starfield.
- Stat strip: streak (`stat`), lessons, courses — REAL `AchievementStats` numbers.
- Rank ladder: `--chronicle-rank-ladder` stepped list of `LadderProgress.ladder[]`,
  current highlighted (accent inset + stronger star + `you` label), progress bar to
  next via `nextProgressPct`.
- Chronicle feed (below).

### 3.6 `ChronicleFeed` (P2)
Props: `chronicle: ChronicleEntry[]`.
- Monitor timeline: emerald marker dot + label + course/sub + mono `completedAt`.
  Differentiated per `eventType`: emerald for lesson/quiz/exam (quiz/exam get mono
  score suffix e.g. `8 / 10`), **red-star** for `certificate`. Scrollable, newest first.
- Empty: "Your sky is still forming. Complete a lesson to light your first star." + CTA.

### 3.7 `LockedSkyTeaser` (P2) — guest
Props: `ctaHref?` (default `/login?next=/profile`).
- Same sky canvas, constellations render LOCKED (dim pinpricks) + soft blur/starfield
  overlay + single CTA "Sign in or create account →". Replaces wall of dead sign-ins.

### 3.8 `CertificateCelebration` (P2)
Props: `seriesSlug, courseName, constellation, streakDays`.
- Full constellation lit + one last ignition → constellation pulse → certificate sheet
  reveals (printable). Red halo finish-line glow.

---

## 4. Component states (all components)

| State | Star visual | Meaning |
|---|---|---|
| locked | 6–8px dot, `--constellation-star-locked`, no glow/line | pre-req/future-gated |
| in-progress | 14px dot `--constellation-star` @0.45 + `--constellation-current-ring` pulse | current/next |
| ignited | 14px dot `--constellation-star-lit` + `--constellation-halo` | completed |
| loading | 14px skeleton shimmer (`--space` shimmer) or static unlit | fetching |
| empty | starfield, 0 lit, editorial copy | no completions |
| error | unlit constellation + inline retry | failed fetch (never crash) |

**Responsive:** desktop = connected path + ladder side-by-side; ≤375px = starfield
grid (no connectors), stats stack 1-col, Chronicle full-width. Interactive stars ≥44px.

---

## 5. User flows

### F1 — Learner completes a lesson (P1)
```
Lesson page → POST /api/progress/lesson
  ├─ first star: ConstellationCelebration overlay (ignition, DAY-N streak chip)
  ├─ subsequent: ignition overlay (shorter), streak count-up to post-write value
  └─ last lesson (courseJustCompleted=true): constellation pulse → "Constellation complete"
                                    → (P2, if cert path) CertificateCelebration → cert reveal
Series outline updates: star flips pending→lit, halo appears, {lit}/{total} increments.
Hub PathCard preview updates: +1 lit dot, counter increments. [stays light]
```
### F2 — Learner views series outline (P1)
```
/learn/[series] → SeriesConstellation beside SeriesSyllabus
  authenticated: lit stars + current-ring on next lesson
  guest: unlit current star + "Sign in to chart your course →" (/login?next=...)
```
### F3 — Learner views profile full sky (P2)
```
/profile → GET ProfileSky (server loader)
  authenticated: sky hero (rank serif) + stats + constellation grid + rank ladder
                 + Chronicle feed
  guest: LockedSkyTeaser (locked sky + single CTA → /login?next=/profile)
```
### F4 — Guest hits /profile (P2)
```
LockedSkyTeaser: locked sky (dim pinpricks, blur) + one CTA. Pairs with B-09.
```

---

## 6. Motion & interaction (for steel)

- **Ignition pop:** `check-pop` spring `cubic-bezier(0.34,1.56,0.64,1)`, star
  `0→1.25→1`, one-shot red flare 400ms.
- **Line draw:** course complete → connecting rails `stroke-dashoffset` animate in
  (300ms stagger).
- **Constellation pulse:** course complete → lit stars pulse in sequence (120ms, ≤1.2s).
- **Streak:** count-up to post-write value; rose `--chronicle-streak`.
- All motion respects global `prefers-reduced-motion` (no transforms/flares;
  `cx-rank-display` flattens to solid ink).

---

## 7. Files in this handoff

- `design/t_65e26fdd/design-tokens-constellations.css` — final tokens + utilities
- `design/t_65e26fdd/mockups/mockup-constellations-chronicle.html` — full-fidelity,
  all surfaces + states, desktop + 375px, light + dark
- `design/t_65e26fdd/reports/design-system.html` — client-facing design system doc
- `design/t_65e26fdd/screenshots/*.png` — exec-light-desktop, exec-dark-desktop, exec-mobile
- `design/t_65e26fdd/moodboards/*.png` — 3 FAL mood-board assets embedded in mockups

**Handoff to:** steel (t_c72908a6) — implements B-18 from these specs.
