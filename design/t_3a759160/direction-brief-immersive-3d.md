# Immersive Three.js Constellations — Design Brief (DISCOVERY)

**Task:** t_3a759160 (discovery) · **Author:** kara (designer) · **Date:** 2026-09-02
**Tenant:** adroit-blog · **Upgrade of:** B-18/B-19 Constellations + Chronicle (already built)
**Engine (LOCKED):** Three.js via react-three-fiber + drei + @react-three/postprocessing (UnrealBloom). D3 is NOT in the main path.
**Downstream execution:** t_89b4bfbf (composes full-fidelity 3D mockups from this brief)
**Status:** DISCOVERY ONLY — direction + tokens + mood boards. The execution task builds the final mockups.

This brief is the source of truth for the 3D execution task. It maps every visual decision onto
the existing arch contract types (`ConstellationStar/State`, `AchievementStats`,
`Rank/RankBand/LadderProgress`, `ProfileSky`, the P1/P2 component props) and the existing 2D
tokens (`design/t_65e26fdd/design-tokens-constellations.css`). The 3D layer is ADDITIVE on the
shipped 2D system — nothing replaces it.

---

## 1. Surface Archetype (committed before tokens)

> **This is a Monitor surface with an Explore navigation layer.** The learner is *watching
> their learning progress accrue as a living sky* — the "hero" is the 3D starfield itself, not
> copy. The profile galaxy adds a navigable journey (Explore) on top of the Monitor aggregate.

| Surface | Archetype | Why |
|---|---|---|
| On-course tracker (Learn course page) | **Monitor** (primary) | Watching course progress accrue as lit stars in real 3D. Density + glanceability. |
| Ignition sequence (on load) | **Decide/Learn moment** | The one earned wow beat — lit stars surge on one-by-one in lesson order. |
| Raycast hover + click-to-fly | **Command/Inspect** (secondary) | Drilling into one star/lesson. Speed and focus. |
| Profile galaxy | **Explore** (primary) + **Monitor** (aggregate) | Browsing an open space of constellation sectors; camera flies between them. |
| Rank ladder → galaxy illumination | **Monitor** (aggregate) | How much of the galaxy is lit = rank. |

**Rule for the execution task:** do NOT give the profile galaxy a marketing hero + three feature
cards. It is a data sky — the "hero" is the navigable 3D galaxy.

---

## 2. One-Line Direction

> **"You are a star-forger. Every lesson you complete ignites a star — a cold pinprick
> blooms into a warm, burning sun. Your learning record is a galaxy you light up, sector by
> sector, from a single faint constellation to a fully-illuminated sky."**

The conceptual anchor is **stellar fusion → ignition**. The existing 2D system already commits to
a cold-to-fire arc (icy-blue pinprick → brand-red ignited). The 3D upgrade **evolves** that arc
into a physically-grounded **star color temperature** language, which is far more cinematic under
UnrealBloom than flat red:

- **Unlit / available** = a pale cool pinprick (icy blue-white, low luminance, NO bloom).
- **Current lesson** = a cyan pulse (brighter cyan, pulsing bloom ring).
- **Ignited / completed** = a **warm golden-white bloom** — the fusion moment. A star that
  ignites goes from cool to warm. This is the signature: warm gold reads as "lit" against the
  cool blue sky far better than red does, and it blooms beautifully.
- **Constellation complete / certificate** = an **ember red flare** — the brand red
  (`#C8102E`) reserved for the finish-line moment, so it stays meaningful.

**What is NOT changed:** the shipped navy/red palette, Inter stack, mono kickers, rounded-xl
cards, category gradients, the existing `check-pop` spring, and the 2D constellation tokens are
all kept. This layer is **additive** — a new 3D visual vocabulary on the existing system.

---

## 3. Design tokens (additive, dark-safe, 3D)

Full draft in `design-tokens-3d.css`. Additive on the shipped semantic system + the 2D
constellation tokens. Every token ships an `html.dark` remap. The 3D tokens are consumed by the
r3f scene (colors, bloom params, star sizes) AND by the 2D overlay chrome (tooltips, minimap,
rank ladder) so the two stay in lockstep.

### 3.1 Star color temperatures (the core decision)
| Token | Light | Dark | Role |
|---|---|---|---|
| `--star-unlit` | `#7DD3FC` @ low luminance | `#9BD8F5` @ low luminance | Pale cool pinprick — available, unborn. NO bloom. |
| `--star-current` | `#4FC3F7` | `#22D3EE` | Cyan pulse — the "you are here" star. Low bloom pulse. |
| `--star-ignited` | `#FFC46B` core / `#FFF7E6` white-hot | `#F0B83A` core / `#FFF7E6` | Warm golden-white bloom — the fusion moment. Medium bloom. |
| `--star-complete` | `#C8102E` (brand red) | `#F05066` | Ember red flare — constellation complete / certificate. High bloom. |
| `--star-line` | `rgba(125,211,252,0.35)` | `rgba(125,211,252,0.40)` | Thin additive connecting rail between lit/current stars. |

### 3.2 Bloom intensity (UnrealBloom params)
| Token | Value | Role |
|---|---|---|
| `--bloom-strength` | `0.7` | Global bloom strength — high enough to glow, low enough to stay crisp. |
| `--bloom-threshold` | `0.85` | Only lit/current/complete stars bloom; unlit pinpricks and the nebula stay below. |
| `--bloom-radius` | `0.5` | Soft, wide halo — not a hard neon edge. |
| `--bloom-unlit` | `0` | Unlit stars: no bloom. |
| `--bloom-current` | `0.35` | Cyan pulse: low bloom. |
| `--bloom-ignited` | `0.6` | Warm gold: medium bloom. |
| `--bloom-complete` | `0.9` | Ember red: high bloom flare. |

### 3.3 Nebula palette (restrained — NOT generic space)
| Token | Light | Dark | Role |
|---|---|---|---|
| `--nebula-base` | `#0B1D3A` | `#070B14` | Deep navy canvas (Fortress navy). |
| `--nebula-cool` | `#4FC3F7` @ 0.10 | `#4FC3F7` @ 0.12 | Cool icy-blue field — the Fortress ice, not generic purple. |
| `--nebula-deep` | `#6D5BD0` @ 0.08 | `#6D5BD0` @ 0.10 | Deep violet field for depth (secondary, low opacity). |
| `--nebula-warm` | `#F0B83A` @ 0.06 | `#F0B83A` @ 0.08 | Faint warm amber counterpoint near completed constellations. |
| `--nebula-starfield` | faint white @ 0.5 | faint white @ 0.6 | drei `<Stars>` field density. |

**Rule:** max 2-3 nebula color fields, low opacity, so it reads as atmosphere, not a rainbow.

### 3.4 Rank ladder → galaxy illumination mapping
The arch defines the ladder (`contracts-constellations.ts`). The DISCOVERY decision: **rank maps
to how much of the galaxy is lit.** The galaxy's overall luminance = rank. This is legible and
motivating — the learner literally watches their galaxy brighten as they climb.

| Band | Galaxy illumination | Star treatment |
|---|---|---|
| starseed | 1 sector faintly lit | The first constellation barely glows. |
| wayfarer | a few sectors partially lit | Dimmer cyan stars. |
| explorer | ~half the galaxy lit | Ice-blue stars, brighter. |
| polestar | most sectors lit, bright | Bright stars + halos. |
| celestial | the whole galaxy fully lit, warm | Warm gold everywhere + strong halos. |

---

## 4. Component specifications (mapped to the arch contracts)

### 4.1 On-course tracker — `SeriesConstellation3D` (P1, replaces the 2D star rail)
Props: `constellation: ConstellationState, isGuest` (same contract as the 2D component).
- **Composition:** the constellation floats in real 3D in a `<Canvas>` beside the syllabus
  (replaces the flat 2D star rail in the `md:sticky` aside). One star per lesson, positioned
  along an organic 3D path (lesson order = path order, NOT a flat 2D chart).
- **Star states:** unlit = faint cool pinprick (no bloom); current = cyan pulse (low bloom);
  ignited = warm gold bloom (medium bloom). Additive blending (`THREE.AdditiveBlending`) so
  stars glow against the dark.
- **Connecting lines:** thin, faint, cool blue-white, additive. Only connect lit + current
  stars — unlit stars are isolated pinpricks ("unborn").
- **Ignition sequence (on load):** lit stars surge on one-by-one in lesson order (staggered
  scale + bloom ramp, ~120ms stagger). The signature moment.
- **Raycast hover:** star lifts (scale up + slight z-offset) + a lesson tooltip (2D overlay
  anchored to the star's screen position). `aria-label={lessonSlug}` + `title` for a11y.
- **Click:** camera flies to the star (smooth tween) → navigates to `/learn/[series]/[lesson]`.
- **Guest (`isGuest`):** render the constellation with the current-lesson star unlit and a
  compact "Sign in to chart your course →" affordance beneath.
- **Background:** drei `<Stars>` field + subtle nebula (2-3 color fields, low opacity).
- **Fallback:** if WebGL is unavailable, fall back to the existing 2D `SeriesConstellation`.

### 4.2 Profile galaxy — `ProfileGalaxy3D` (P2, replaces the flat full-sky section)
Props: `sky: ProfileSky` (same contract as the 2D `FullSkySection`).
- **Composition:** every course = a constellation in its own 3D sector, arranged across a
  galaxy. Completed constellations fully lit (warm gold), in-progress partially lit, unstarted
  faint (cool pinpricks).
- **Free-floating stars:** blog article reads scatter single stars through the galaxy (a
  secondary "reading" constellation layer, distinct from course stars).
- **Camera navigation:** camera flies between constellations (smooth tween) or jumps via a
  minimap (2D overlay showing sector positions). Click a sector → camera flies to it.
- **Rank ladder → illumination:** the galaxy's overall luminance maps to rank (§3.4). A rank
  ladder overlay (2D, reusing the existing `cx-rung` pattern) shows the current band + progress.
- **Stat strip + Chronicle:** the existing 2D stat block + `ChronicleFeed` remain as an overlay
  panel beside/over the 3D galaxy (Monitor aggregate).
- **Fallback:** if WebGL is unavailable, fall back to the existing 2D `FullSkySection`.

### 4.3 Ignition celebration — `ConstellationCelebration3D` (P1, optional upgrade)
Props: same as the 2D `ConstellationCelebrationProps`.
- The single ignited star blooms center-stage in 3D (scale `0 → 1.25 → 1` with the existing
  `check-pop` spring, warm gold bloom ramp). Course complete → the full constellation pulses in
  sequence, then the ember red flare.
- Respect `prefers-reduced-motion` (no scale/bloom — a static lit state is shown).

---

## 5. Component states (all components)

| State | Star visual | Meaning |
|---|---|---|
| **locked** | faint cool pinprick, no bloom, no line | Pre-req/future-gated lesson — unborn star |
| **in-progress** | cyan pulse + pulsing bloom ring | The lesson you're currently on / next to light |
| **ignited** | warm gold bloom | Lesson completed |
| **complete** | ember red flare | Constellation complete / certificate |
| **loading** | static unlit stars + subtle shimmer | Data still fetching |
| **empty** | starfield with 0 lit, editorial empty-state copy | No completions yet |
| **error** | constellation renders unlit + inline retry | Failed fetch — never crash the page |
| **no-webgl** | fall back to the 2D component | WebGL unavailable |

**Responsive:** desktop = full 3D canvas. ≤768px = the 3D canvas shrinks to a compact
constellation (fewer visible stars, camera pulled back) or falls back to the 2D starfield grid.
Hit targets for any interactive star ≥44px on touch.

---

## 6. Motion & interaction notes (for steel)

- **Ignition sequence:** lit stars surge on one-by-one in lesson order, ~120ms stagger, scale +
  bloom ramp. The signature moment.
- **Raycast hover:** star lifts (scale + z-offset) + tooltip. Smooth, ~150ms.
- **Click-to-fly:** camera tweens to the star (ease-in-out, ~600ms) → navigates to the lesson.
- **Camera fly (galaxy):** smooth tween between sectors (~800ms) or instant jump via minimap.
- **Bloom:** UnrealBloom with `--bloom-strength 0.7`, `--bloom-threshold 0.85`,
  `--bloom-radius 0.5`. Only lit/current/complete stars bloom.
- All motion respects the global `prefers-reduced-motion` block (no transforms/bloom/camera
  tween — a static lit state is shown).

---

## 7. Open decisions for the execution task (keep LOW-RISK)

1. **Warm gold vs. brand red for ignited stars** — RECOMMEND warm gold (`--star-ignited`) for
   individual ignited stars, reserving brand red (`--star-complete`) for the constellation
   complete / certificate finish-line. This is more cinematic under bloom and keeps red
   meaningful. Confirm against the existing 2D red-ignited convention (the 2D system stays red;
   only the 3D layer adopts warm gold).
2. **Nebula restraint** — RECOMMEND max 2-3 color fields at low opacity (cool ice + deep violet
   + faint warm amber). Do NOT let it become a generic purple/teal space gradient.
3. **WebGL fallback** — RECOMMEND graceful fallback to the existing 2D components when WebGL is
   unavailable or `prefers-reduced-motion` is set. The 3D layer is progressive enhancement.

---

## 8. Anti-slop self-audit (this discovery)

- **1 Tech gradient:** NONE — the sky is the deep-navy Fortress navy; stars are warm gold / cyan /
  cool ice, not a blue-violet glossy gradient. ✔
- **2 Generic tech hue:** NO — the cool accent is the existing Fortress ice `#4FC3F7`, not
  indigo. The warm gold is a deliberate star-temperature choice, not a default. ✔
- **3 Feature-tile grid:** NO — surfaces are data (Monitor/Explore), no icon+heading+sentence×3. ✔
- **4 Accent rail:** NO — the rank ladder uses an inset star/accent, not a decorative left strip. ✔
- **5 Unearned blur:** NO glassmorphism on the core surfaces; the sky is a deliberate 3D canvas. ✔
- **6 Monument stat:** streak/rank numbers are real `AchievementStats`, shown once, not filling space. ✔
- **7 Icon topper:** NO — the star IS the data, not an icon above a heading. ✔
- **8 Center stack:** NO — the only centered moment is the ignition overlay (Decide/Learn beat). ✔
- **9 Default type:** Inter kept (existing brand); mono kickers chosen. ✔
- **10 Wrong surface:** NO — Monitor surfaces, Explore navigation on the galaxy, ignition overlay
  is the one earned Decide/Learn moment. ✔

**Slop score: 1/10** (only #9 partially fires — Inter is the established brand face, so it's a keep).

## 9. Wow-factor bar (this discovery sets the direction)

1. **Real imagery** — 4 mood board assets (FAL) embedded in the brief; the 3D scene is the imagery. ✔
2. **Motion** — ignition sequence, raycast hover lift, click-to-fly, camera fly, bloom ramp,
   reduced-motion respected. ✔
3. **Depth** — UnrealBloom, additive blending, nebula fields, layered 3D elevation. ✔
4. **Typographic scale** — oversized sky display + mono kicker contrast (kept from 2D). ✔
5. **Craft details** — consistent star/space/radius system, a11y labels, states on everything. ✔
6. **Signature element** — the **ignition sequence** (lit stars surge on one-by-one in lesson
   order) + the **navigable galaxy** (camera flies between sectors). ✔
**Bar: 6/6** for the direction; the execution task must hold ≥4/6 on every final mockup.

---

## 10. Handoff to execution (t_89b4bfbf)

- **Files this brief points at:** `direction-brief-immersive-3d.md` (this),
  `design-tokens-3d.css`, `moodboards/*.png` (4 FAL images).
- **Contract alignment:** every component name/type above is exactly
  `contracts-constellations.ts`. Do not rename. Use `RankBand`/`Rank`/`LadderProgress` for the
  ladder. The 3D components are NEW (`SeriesConstellation3D`, `ProfileGalaxy3D`) — they consume
  the same props as the 2D components they replace.
- **Engine:** Three.js via react-three-fiber + drei + @react-three/postprocessing (UnrealBloom).
  D3 is NOT in the main path (it renders flat charts, cannot do bloom/parallax/navigation).
- **Deliverables expected from execution:** full-fidelity 3D mockups (desktop + mobile) for each
  surface, final tokens, and a `reports/design-system.html` — then handoff to **steel**.
