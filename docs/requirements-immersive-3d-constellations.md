# Requirements: Immersive 3D Constellations (celestial-immersion v1.1.0)

> **SUPERSEDED (2026-09-04):** Visual direction for the constellation 3D layer is now **Hubble Field** (Rev 3). See `docs/hubble-field-north-star.md`, `docs/requirements-hubble-field.md`, and `docs/arch-hubble-field.md`. This document is retained as historical record of the Rev 2 celestial-immersion requirements. Do not implement from this file.

> **Tenant:** adroit-blog
> **Workspace:** /Users/kelex/Documents/Fortress-of-Solitude/adroit-blog
> **Date:** 2026-09-02
> **Author:** Lois Lane (BA)
> **Governing spec:** docs/immersive-3d-constellations-plan.md (REV 2, 2026-09-02)
> **Arch reference:** docs/arch-immersive-3d.md + docs/system-architecture-constellations.md
> **Handoff to:** brainiac (web architect) -> kara (concept) -> steel (build)

---

## Executive Summary

The Adroit Learn course-tracking experience currently renders each course as a flat 2D constellation (one star per lesson, lit as completed) on the series page and a static full-sky grid on the profile. This build adds an immersive 3D layer on top of that shipped 2D system. The learner is placed INSIDE a real, deep sky: every lesson they complete re-lights a star of a real constellation, and their learning record becomes a sky they bring back to life, asterism by asterism.

This is a creative REBOOT. The prior design direction (Rev 1) was rejected by Chris as generic space / "first-year stuff." Rev 2 reboots the visual language from scratch on a real-astronomy grounding, takes full advantage of Three.js (custom GLSL, GPU-first), and delivers true immersion (real depth, parallax, volumetric dust). The Web Dev team owns the final visual language and build; kara's prior artifacts are input/reference only, never approved direction.

Two surfaces are in scope:

1. **On-course tracker** (`/learn/[series]`) - the course constellation floats in real 3D; the learner is inside the sky. Ignited stars bloom, unlit stars are faint pinpricks, the current lesson star pulses, lit stars surge on one-by-one in lesson order on load, hovering a star lifts it and shows a lesson tooltip, clicking flies to the lesson.
2. **Profile galaxy** (`/profile`) - a navigable journey. Every course is a real constellation in its own 3D sector; completed constellations fully lit, in-progress partially lit, unstarted faint. Free-floating stars from blog article reads scatter through the galaxy. The camera flies between constellations (smooth tween) or jumps via a minimap. The rank ladder (Starseed to Celestial) maps to how much of the galaxy is lit.

Build order: course tracker first, profile galaxy second.

---

## Decision Log (Chris, 2026-09-02) - locked, do not re-litigate

These are non-negotiable constraints for this build:

1. **Real-astronomy grounding, NOT a Kryptonian/DC-lore theme.** Chris rejected the Kryptonian heritage framing. The visual language must be anchored in real-world astronomy and space as they actually are: real constellations, real stellar physics, real depth.
2. **Full advantage of Three.js.** The spec must reach under the hood: custom GLSL shaders, GPU-first rendering, procedural nebula, cinematic camera. Stock drei helpers + bloom alone are insufficient and read as tutorial-level.
3. **True immersion (the one approved creative throughline).** Chris explicitly kept "break the flat 2D figure-ground" from the rejected direction. The experience must place the learner INSIDE a real depth of sky: real 3D parallax, volumetric dust, depth fog, not in front of a poster of stars.
4. **Engine LOCKED:** Three.js via react-three-fiber (r3f) + drei + @react-three/postprocessing (UnrealBloom). D3 is NOT in the main path.
5. **Course to constellation mapping (real asterisms):** Salesforce Architect -> Orion, Agentic AI -> Cassiopeia. Authored charts where star count = lesson count (star-per-lesson, already satisfied by `buildConstellation`). Where a real constellation has fewer bright member stars than a course has lessons, the remaining lesson-stars are fainter real field members of that constellation (its Bayer-designated stars), NOT invented scatter. The constellation is drawn as it actually appears.
6. **Real stellar physics drives the color language.** Ignited/completed states are warm luminous (white-gold / yellow-white / warm), consistent with a real star's photosphere at the finish of its arc. Red is NOT a general star color; it reads as alert and stays reserved for Kryptonian brand chrome (nav pill, certificate finish-line). Minor orange-red tint is permitted ONLY where astronomically justified on a specific named star (e.g. Betelgeuse in Orion is genuinely a red supergiant) - it is an exception for accuracy, never a general ignited-state color.
7. **The constellation IS the lesson map.** Click a star to open the lesson; the text list demotes to mobile/a11y fallback.
8. **3D layer is ADDITIVE on the shipped 2D system.** Nothing replaces the existing 2D components; the 3D layer is progressive enhancement with graceful WebGL fallback to the 2D layer.
9. **Source of truth stays the `completion_events` log** (RLS, owner-scoped). No schema redesign except one additive migration (G1, below).
10. **Release:** feature bump -> adroit-blog **v1.1.0**, release name **celestial-immersion** (proposed, not yet cut).

---

## User Stories

### US-001: On-course immersive constellation (learner)

**As a** logged-in learner on a course page,
**I want** the course constellation to float in real 3D with my completed lessons re-lit as burning stars,
**so that** I can see my progress accrue as a living sky and feel inside the course, not in front of a list.

**Acceptance Criteria:**
- Given I am logged in and viewing `/learn/[series]` with WebGL available, when the page loads, then the constellation renders in real 3D with real depth (parallax, volumetric dust, depth fog), not a flat 2D figure-ground.
- Given the constellation has lit stars, when the page loads, then lit stars surge on one-by-one in lesson order (ignition sequence), not all at once.
- Given there is a current lesson, when the page renders, then the current lesson star pulses with a soft halo (cool blue-white A/B-class point).
- Given I hover a star, when my pointer is over it, then the star lifts and a lesson tooltip appears.
- Given I click a star, when the click registers, then I navigate to that lesson (`/learn/[series]/[slug]`).
- Given the course is complete, when the constellation renders, then all stars are lit in their warm luminous / white-hot finish state.
- Given I am on a mobile viewport (<=768px), when the page renders, then I see a compact constellation (fewer stars, camera pulled back) or the 2D fallback, with interactive star hit targets >=44px on touch.
- Given I have `prefers-reduced-motion: reduce`, when the page renders, then ignition, parallax, drift, film-grain, and camera breathing are disabled and the camera settles on a static lit state.

### US-002: On-course immersive constellation (guest / no-WebGL)

**As a** guest or a user without WebGL,
**I want** to see the existing 2D constellation,
**so that** the surface never goes dark and I can still track my progress.

**Acceptance Criteria:**
- Given I am a guest, when I view `/learn/[series]`, then I see the 2D `SeriesConstellation` (locked/lit shape without per-lesson progress labels).
- Given WebGL is unavailable, when the page renders, then the 2D `SeriesConstellation` renders as a graceful fallback (no crash, no blank canvas).
- Given the 3D chunk is still loading, when the page renders, then a shimmer `LoadingSky` fallback shows until the first frame.

### US-003: Profile galaxy (learner)

**As a** logged-in learner on my profile,
**I want** a navigable 3D galaxy where every course is a real constellation in its own sector,
**so that** I can see my whole learning journey as a sky I am bringing back to life and navigate between courses.

**Acceptance Criteria:**
- Given I am logged in and viewing `/profile` with WebGL available, when the page loads, then the galaxy renders with every course as a real constellation in its own 3D sector on a ring.
- Given a course is completed, when the galaxy renders, then its sector is fully lit.
- Given a course is in progress, when the galaxy renders, then its sector is partially lit.
- Given a course is unstarted, when the galaxy renders, then its sector is faint.
- Given I have read blog articles, when the galaxy renders, then free-floating stars from those article reads scatter through the galaxy interior (sourced from real `article` events, not lesson rows).
- Given I want to move between sectors, when I click a sector or a minimap dot, then the camera flies to that sector with a smooth cinematic tween (or jumps via the minimap).
- Given I have a rank, when the galaxy renders, then the rank ladder maps to how much of the galaxy is lit (Starseed 0.10 -> Celestial 1.00).
- Given I am a guest, when I view `/profile`, then I see the locked-sky teaser (existing behavior).

### US-004: Profile galaxy (guest / no-WebGL)

**As a** guest or a user without WebGL,
**I want** to see the existing static full-sky hero,
**so that** the profile surface never goes dark.

**Acceptance Criteria:**
- Given I am a guest, when I view `/profile`, then I see the locked-sky teaser.
- Given WebGL is unavailable, when the page renders, then the static 2D hero (`SkyHeroChrome`) renders as a graceful fallback with the same header chrome + stat block.

### US-005: Real stellar color language

**As a** learner,
**I want** star colors to follow the real spectral-class temperature arc (OBAFGKM),
**so that** the sky reads as real astronomy, not an invented rainbow.

**Acceptance Criteria:**
- Given a star is unlit (available, unborn), when it renders, then it is a faint cool field star / protostar: a dim, desaturated cool point with NO bloom.
- Given a star is current (you are here), when it renders, then it is a cool blue-white A/B-class point with a soft pulsing halo and low bloom pulse.
- Given a star is ignited (fusion moment), when it renders, then it is a warm yellow-white (G-class, Sun-like) bloom with medium bloom. This is the core reward color: warm, bright, alive.
- Given a star is complete (finished), when it renders, then it is white-hot / warm white, the brightest and most luminous state, with the highest bloom. NOT red.
- Given a completed asterism has a true giant member (e.g. Betelgeuse in Orion), when it renders, then it may show its authentic orange-red tint as an accuracy accent (ADR-303 exception).
- Given a star is lit, when it renders, then red is NEVER used as a general star color; red is reserved for Kryptonian brand chrome only.
- Given the constellation has lit/current stars, when it renders, then a thin additive connecting rail traces the real asterism's connecting figure between them.
- Given the sky renders, when I look at it, then per-star color temperature, magnitude, and size derive from each star's real spectral class and apparent magnitude (vary every star, never identical).

### US-006: Full-advantage Three.js rendering

**As a** learner,
**I want** the sky rendered with custom GLSL shaders and GPU-first techniques,
**so that** the result reads as deep, cinematic astronomy and not a tutorial-level demo.

**Acceptance Criteria:**
- Given the scene renders, when the starfield draws, then it is a single `Points` buffer with per-star shader attributes (`aColorTemp`, `aMagnitude`, `aTwinklePhase`, `aTwinkleSpeed`, `aSpike`) on a custom `RawShaderMaterial` - thousands of stars, zero per-star draw calls, none identical.
- Given the scene renders, when stars twinkle, then twinkle is a shader time-uniform (`uTime + aTwinklePhase`), never per-star JS setTimeout.
- Given the scene renders, when the background draws, then a procedural nebula shader (fragment fbm/simplex noise) renders as a volumetric billboard layer plus a Milky Way band of unresolved faint stars, with zero texture assets.
- Given the scene renders, when the camera moves, then Keplerian parallax shifts stars on multiple depth shells at real relative distances, so the sky has genuine depth and rotates around the observer.
- Given the scene renders, when post-processing runs, then a full EffectComposer chain applies: UnrealBloom (per-state tuned) + subtle chromatic aberration on hot stars + vignette + restrained film grain tied to state, composited on GPU in one pass.
- Given a star ignites, when the fusion moment happens, then a real light bloom / scatter flare plays (a sprite that flairs), not just a pinned sprite color swap.
- Given the scene renders, when state transitions happen, then the real stellar color-temperature arc becomes ONE `uColorTemp`/`uState` uniform ramped per star, so transitions are buttery GPU interpolations, not discrete color swaps.
- Given the scene renders, when the camera moves on-course, then damped drift + pointer parallax make the constellation feel like you are drifting through it.

### US-007: Performance and bundle discipline

**As a** developer,
**I want** the 3D layer lazy-loaded and GPU-first,
**so that** blog pages never pull three and low-end devices degrade gracefully.

**Acceptance Criteria:**
- Given the 3D layer exists, when it is imported, then the whole three/r3f chunk is behind `next/dynamic(..., { ssr: false })` on the two public entries (`SeriesConstellation3D`, `ProfileGalaxy3D`).
- Given a blog, home, hub, tags, search, or certificate page renders, when the bundle is traced, then three is NOT in the bundle (no top-level three import).
- Given the canvas renders, when the device pixel ratio is set, then `dpr={[1,2]}` and `gl={{ antialias: true, powerPreference: 'high-performance' }}`.
- Given a no-WebGL client, when the page loads, then the 3D chunk is never requested (the WebGL gate short-circuits before the dynamic import).
- Given the scene renders, when the render loop runs, then it is cheap (sprite `useFrame` + damped lerps); `frameloop="demand"` is added only if profiling shows a hot idle loop.

### US-008: Reduced motion (a11y)

**As** a user who prefers reduced motion,
**I want** the 3D experience to honor my motion preference,
**so that** I am not subjected to ignition, drift, parallax, or camera tweening.

**Acceptance Criteria:**
- Given I have `prefers-reduced-motion: reduce`, when the scene mounts, then a `usePrefersReducedMotion` hook reads `matchMedia('(prefers-reduced-motion: reduce)')` and drives `staticMode`.
- Given `staticMode` is on, when the scene renders, then ignition, parallax, drift, film-grain, and camera breathing are disabled and the camera settles.
- Given `staticMode` is on, when the DOM renders, then `@media (prefers-reduced-motion: reduce)` zeroes DOM transitions and shimmer animation.

### US-009: Article event type (G1 - profile galaxy data)

**As a** learner,
**I want** the free-floating stars in my galaxy to come from my real blog article reads,
**so that** the galaxy reflects my actual reading, not fabricated lesson data.

**Acceptance Criteria:**
- Given the `completion_events` table, when the migration runs, then the `event_type` CHECK is widened to include `article` (Postgres drop + re-add, same pattern as migration 010).
- Given a signed-in user reads a blog post, when the read completes, then one `article` event is appended (idempotent by user + event_type + lesson_slug = post slug).
- Given the galaxy renders, when article stars are sourced, then `galaxy-model.ts` sources them from `chronicle` rows whose `event_type === "article"`, NOT from `lesson` rows.
- Given the blog-read write site is deferred, when the galaxy renders, then it falls back gracefully (the placeholder is removed only when the source exists).

---

## Data Entities

### Source of truth (unchanged)

| Entity | Notes |
|---|---|
| `completion_events` | RLS, owner-scoped. Sole source of truth for what is lit. No schema redesign except the additive G1 migration. |

### Data wiring

| Input | Derivation | Consumed by |
|---|---|---|
| `course_id + lesson_slug` (lesson rows) | `ConstellationState.stars[].lit` via `buildConstellation` (src/lib/sky.ts) | On-course SeriesScene lights the real asterism's stars; current slug pulses |
| `course_id` aggregation | `ConstellationState.complete / litStars` | `buildGalaxyModel` maps each course to a galaxy SECTOR (a real constellation) |
| `event_type 'article'` (NEW, G1) | Free-floating `ArticleStar[]` in the galaxy interior | Sourced from chronicle rows with `event_type === "article"` |
| lesson count + course count | `deriveRank` -> `RankId` -> `RANK_ILLUMINATION` | Galaxy luminance (Starseed 0.10 -> Celestial 1.00) |

### Course to real constellation mapping (authored, not derived)

| Course | Real constellation | Notes |
|---|---|---|
| Salesforce Architect (`salesforce-architect`) | **Orion** | Real hunter asterism: belt stars, Betelgeuse (red supergiant, real orange cast), Rigel (blue-white), M42 in the sword as the ignition/completion anchor |
| Agentic AI (`agentic-ai`) | **Cassiopeia** | Real W-shaped asterism |

Each course maps to a real named constellation whose (Bayer-designated) member stars are authored with real coordinates, spectral class, and apparent magnitude. Lesson count must equal member-star count used; where a course has more lessons than bright members, map the overflow to progressively fainter real members of that constellation. No DB change; content wiring at the loader (`buildConstellation`). Author from a canonical source (e.g. IAU constellation charts / Bayer designations); do not hand-invent positions.

### G1 migration (additive, follow-up)

| Change | DDL / shape | Notes |
|---|---|---|
| Widen `event_type` CHECK | drop + re-add to include `'article'` | Postgres can't alter an inline CHECK in place. Same pattern as migration 010. |
| Write site | append one `article` event when a signed-in user reads a blog post | Idempotent by user + event_type + lesson_slug = post slug |
| `galaxy-model.ts` | source article stars from `chronicle` rows with `event_type === "article"` | Remove the placeholder only when the write site exists |

**G1 is a follow-up migration** because shipping it touches a live CHECK constraint; do NOT run it blind. If the blog-read write site is deferred, ship it as a separate card so the galaxy falls back gracefully.

---

## Integration Needs

### Existing (reuse)

| Item | Notes |
|---|---|
| `completion_events` log | Sole source of truth; RLS owner-scoped |
| `buildConstellation` (src/lib/sky.ts) | Star-per-lesson, already satisfied |
| `deriveRank` / `RANK_ILLUMINATION` | Rank ladder -> galaxy luminance |
| 2D `SeriesConstellation`, `FullSkySection` | Graceful WebGL fallback targets |
| `usePrefersReducedMotion` (G2) | New hook; wire into both public entries |

### New (architect / build)

| Item | Notes |
|---|---|
| Custom GLSL shaders | `starfield-gl.tsx`, `nebula-gl.tsx`, `star-material.glsl.ts` (single `Points` buffer, procedural nebula) |
| Full EffectComposer chain | UnrealBloom (per-state) + chromatic aberration + vignette + film grain |
| Keplerian parallax + cinematic camera | Depth shells, dolly-and-tilt, damped easing (maath) |
| G1 `article` event | Migration + write site + `galaxy-model` sourcing |
| G2 reduced-motion hook | `usePrefersReducedMotion` -> `staticMode` |

---

## Constraints

- Engine is LOCKED: Three.js via react-three-fiber (r3f) + drei + @react-three/postprocessing (UnrealBloom). D3 is NOT in the main path.
- Full-advantage posture: custom GLSL shaders and GPU-first techniques are REQUIRED, not optional. Stock drei `<Stars>`/`<Float>` + a single bloom pass is explicitly insufficient.
- Real-astronomy grounding: NOT a Kryptonian/DC-lore theme. Do not reintroduce Rao / House-of-El theming.
- Red is NOT a general star color. Reserved for Kryptonian brand chrome. Sole exception: astronomically-red named members (Betelgeuse).
- Stars are layered additive LIGHT, never drawn strokes. Vary every star (temperature, magnitude, tilt, staggered twinkle). Uniform stars read as emoji/clip-art.
- No invented generic space. Anchor the aesthetic in real astronomical structure.
- Source of truth stays `completion_events`. No schema redesign except the additive G1 migration.
- 3D layer is ADDITIVE on the shipped 2D system; graceful WebGL fallback to 2D.
- Lazy-load the whole three/r3f chunk; blog pages never pull three.
- DPR cap 2; respect `prefers-reduced-motion`.
- No production code written by BA/design; Web Dev team owns the final visual + build.

---

## Scope

### In scope
- On-course immersive 3D constellation tracker (`/learn/[series]`), Orion first.
- Profile 3D galaxy (`/profile`), navigable with sectors, article stars, minimap, rank illumination.
- Real-asterism data (Orion, Cassiopeia) authored with real coordinates, spectral class, magnitude.
- Custom GLSL shaders + GPU-first rendering (single `Points` buffer, procedural nebula, cinematic camera).
- Full EffectComposer post-processing chain.
- G1 `article` event type (migration + write site + galaxy sourcing).
- G2 reduced-motion hook + wiring.
- WebGL fallback to 2D; no-three-on-blog bundle discipline.
- AC-7 human visual gate before release.

### Out of scope
- Kryptonian / DC-lore heritage theme (rejected).
- Generic space art / clip-art circles (rejected).
- Final visual design (kara concept -> steel build owns it).
- D3 rendering in the main path.
- Other learn series adopting the pattern (they follow the checklist later).

---

## Priority

**High** - This is the flagship immersive upgrade to the shipped Constellations + Chronicle system. It carries the creative reboot Chris mandated and the AC-7 visual sign-off gate is non-negotiable.

---

## Open Questions for Chris

1. **Release name confirmation:** The plan proposes release name `celestial-immersion` for v1.1.0. Confirm this is the name to cut.
2. **G1 article-event sequencing:** The plan says ship G1 as a follow-up migration because it touches a live CHECK constraint. Confirm whether the blog-read write site ships in this release or as a separate card (galaxy falls back gracefully either way).
3. **Course coverage:** The plan maps Salesforce Architect -> Orion and Agentic AI -> Cassiopeia. Confirm whether the other learn series (omni-studio-cert, hermes-consultant, ai-at-work) get real-asterism mappings in this release or are deferred to a later pass.

---

## Risks and Tradeoffs

- **Shaders are the hardest, highest-risk work.** Build the starfield shader as a small isolated proof first; unit-test attribute wiring; keep a stock-material fallback path so the interactive layer degrades cleanly if a device rejects the shader.
- **Article-event migration touches a live CHECK.** Do not run it as part of a bundled commit without the write site; if deferred, ship as a separate card so the galaxy falls back gracefully.
- **Bundle on /profile and /learn.** Lazy import verified; watch that a future shared-layout refactor does not reintroduce a top-level three import (bundle-trace gate in integrate).
- **Real-asterism data accuracy.** Author from a canonical source (IAU constellation charts / Bayer designations); do not hand-invent positions.
- **Shared GPU/browser perf on low-end devices.** WebGL gate + dpr cap + reduced-motion reduce the worst case to the 2D layer.
- **Creativity drift back to generic space.** The AC-7 visual sign-off gate is non-negotiable; the hard rejection floor ("reads as generic space") applies to every visual checkpoint.
