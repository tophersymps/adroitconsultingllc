# System Architecture — Immersive Three.js Constellations (course tracker + profile galaxy)

> **SUPERSEDED (2026-09-04):** Visual direction for the constellation 3D layer is now **Hubble Field** (Rev 3). See `docs/hubble-field-north-star.md`, `docs/requirements-hubble-field.md`, and `docs/arch-hubble-field.md`. This document is retained as historical record of the celestial-immersion v1.1.0 architecture. Do not implement from this file.

**Tenant:** adroit-blog · **Release:** celestial-immersion v1.1.0
**Architect:** brainiac (task t_58866c93) · **Pipeline stage → design (kara) → build (steel), gated by this card**
**Inputs:** kara's FRESH clean-slate concept (t_66ab1383) — `docs/design-immersive-3d-concept/` (concept brief + design-tokens-3d.css + 4 moodboards). **This arch targets kara's REV 2 tokens, NOT the stale rejected Rev 1 design.**

Immersive upgrade to the already-shipped "Constellations + Chronicle" system. Two surfaces:

1. **On-course tracker** — the Learn course page (e.g. Salesforce System Architect Primer Constellation, 29 lessons): the constellation floats in real 3D, ignited stars bloom (UnrealBloom), unlit stars are faint pinpricks, the current lesson star pulses, lit stars surge on one-by-one in lesson order on load, raycast hover lifts a star + shows a lesson tooltip, click flies to the lesson. Background: real-depth starfield (per-star parallax shells) + procedural nebula.
2. **Profile galaxy** — a navigable journey: every course = a real constellation in its own 3D sector; completed fully lit, in-progress partially lit, unstarted faint; free-floating stars from blog article reads scattered through the galaxy; the camera flies between constellations (damped tween) or jumps via a minimap; the rank ladder (Starseed → Celestial) maps to how much of the galaxy is lit.

**Engine LOCKED:** Three.js via react-three-fiber + drei + @react-three/postprocessing (UnrealBloom). D3 is NOT in the main path. Next.js app (16.3.0, App Router).

---

## 0. The three hard mandates (REV 2 — do not lose)

1. **Real-astronomy grounding, NOT Kryptonian/DC-lore.** Real asterisms (Orion = belt + Betelgeuse + Rigel + M42 sword), real spectral classes (OBAFGKM), real parallax depth. The unlit→ignited→complete arc is a real stellar-evolution journey (protostar → main-sequence → white-hot finish), tuned warm/luminous at the finish.
2. **Full advantage of Three.js.** Custom GLSL shaders (single `Points` buffer + `RawShaderMaterial` per-star attributes), procedural fbm/simplex nebula (zero texture assets), shader-driven ignition wave + twinkle, Keplerian parallax across true depth shells, cinematic dolly-and-tilt camera, full `EffectComposer` chain (bloom per-state + chromatic aberration + vignette + restrained film grain). Stock drei `<Stars>`/`<Float>` + a single bloom pass is EXPLICITLY insufficient.
3. **True immersion = break the flat 2D figure-ground.** The learner is INSIDE a real depth of sky — volumetric dust, depth fog, per-star distance parallax — not looking at a poster of stars.

**Design ownership:** steel owns the final visual + build; kara's concept is input, not the final visual. The AC-7 human visual gate (reads as real/deep/immersive astronomy, NOT generic space / clip-art circles / first-year) is non-negotiable.

---

## 1. State of the codebase (constraint, not target)

A working 3D scaffold exists in `src/components/Constellations/3d/` (untracked). **Verified as of this card:** `npx tsc --noEmit` clean; `npx vitest run` 482/482 pass (73 files); `three@0.185.1`, `@react-three/fiber@9.7.0`, `@react-three/drei@10.7.8`, `@react-three/postprocessing@3.1.1`, `maath@0.10.8`, `@types/three@0.185.4` are dependencies; the Learn page and FullSkySection already import the public entries.

**What stays (verified good):** the pure model layer (`star-model.ts`, `galaxy-model.ts`), the layered-light `IgnitedStar` sprite stack, `ConstellationCanvas` lazy shell with WebGL gate + `LoadingSky`, `SeriesScene` ignition sequence + damped drift + raycast, `ProfileScene` sector ring + damped camera flight, `SectorMinimap` / `StarTooltip` DOM overlays, `glow-texture` shared texture, `webgl` SSR-safe detection.

**What this card refreshed (the contracts):**
- `star-model.ts` — **re-encoded to kara's REV 2 tokens**: added the real `OBAFGKM` spectral arc (`SPECTRAL_ARC`), the `BETELGEUSE_ACCENT` (ADR-303 exception), refreshed `STAR_PALETTE` to the fresh state ladder (unlit `#6b7a99`, current `#aac4ff`, ignited `#fff4e0`, complete `#ffffff` — warm luminous finish, NO red), and added per-star `spectralClass`/`magnitude`/`isRedGiantAccent` to `Star3D` so the shader can drive per-star color temperature + size. `buildSeriesStars` now derives spectral class + magnitude deterministically per star (scaffold fallback; the loader authors real IAU/Bayer data by overriding).
- `galaxy-model.ts` — **G1 fixed**: free-floating article stars now source from REAL `article` rows (`eventType === "article"`), never faked from lesson rows. Until the article write site lands, this yields zero article stars (graceful fallback).
- `contracts-constellations.ts` — **G1 contract**: `CompletionEventType` widened to include `"article"` (additive; both eventType switches have `default` cases so nothing breaks).

**Gaps steel must close (section 4/5):**

| # | Gap | Why it matters | Required change |
|---|---|---|---|
| G1 | `article` event type not real | Profile galaxy scatters free-floating stars from blog reads as a new `article` event. Today the model sources them from `article` rows but no write site exists yet. | A follow-up DB migration widens the `event_type` CHECK to include `article`; a write site appends an `article` event when a signed-in user reads a blog post; `galaxy-model.ts` (already updated) sources from `article` rows. |
| G2 | `prefers-reduced-motion` inert | The gate exists in the scene code but defaults to `false` and is never bound to `matchMedia('(prefers-reduced-motion: reduce)')`, so reduced-motion users still get ignition, drift, tweening. A11y regression vs the shipped 2D layer. | A `usePrefersReducedMotion` hook reads `matchMedia` and is passed into `SeriesConstellation3D` + `ProfileGalaxy3D`; it disables ignition, parallax, drift, film-grain, and camera breathing. |

Steel must NOT re-derive design or re-verify the visual language — kara owns that and it is approved.

---

## 2. Component decomposition (AC-1)

All paths under `src/components/Constellations/3d/` unless noted. Public entry components are lightweight and server-page-safe; the full three/r3f stack is `next/dynamic(..., { ssr: false })` behind them so blog pages never pull three.

```
src/components/Constellations/3d/
├── ConstellationCanvas.tsx      r3f <Canvas> shell: full EffectComposer (bloom per-state +
│                                CA + vignette + grain), dpr cap [1,2], WebGL gate,
│                                LoadingSky until first frame. (steel: replace drei <Stars>
│                                with the procedural nebula + Milky-Way band.)
├── SeriesConstellation3D.tsx    PUBLIC on-course entry. Lazy-imports canvas + scene; WebGL
│                                gate → 2D SeriesConstellation fallback; hosts StarTooltip;
│                                owns lesson-click navigation (next/navigation).
├── SeriesScene.tsx              r3f on-course scene: builds Star3D set from the real
│                                asterism, renders shader stars + connecting rails, ignition
│                                sequence (120ms stagger), damped camera drift + Keplerian
│                                parallax, raycast hover → StarTooltip + click-to-fly.
├── ProfileGalaxy3D.tsx          PUBLIC profile-galaxy entry. Lazy-imports canvas + scene; WebGL
│                                → fallback2D; overlays SectorMinimap + chrome (children); owns
│                                sector → learn navigation.
├── ProfileScene.tsx             r3f galaxy scene: SectorConstellation per course on an XZ ring,
│                                free-floating article stars, cinematic camera flight between
│                                sectors, rank → illumination luminance.
├── starfield-gl.ts              (steel, NEW) <points> ONE Points buffer with per-star shader
│                                attributes (aColorTemp, aMagnitude, aTwinklePhase/Speed,
│                                aSpike). Custom RawShaderMaterial. Replaces per-star sprites
│                                at scale; interactive lesson stars stay IgnitedStar sprites.
├── nebula-gl.ts                 (steel, NEW) Procedural fbm/simplex nebula shader — zero texture
│                                assets; volumetric billboard layer + Milky Way band of
│                                unresolved stars.
├── star-material.glsl.ts        (steel, NEW) Custom star shader (vertex + fragment) as exported
│                                GLSL strings — per-star drift, temperature gradient, spectral
│                                spike cross, opacity noise.
├── IgnitedStar.tsx              Individual layered-light star (bloom + mid + core sprites) for
│                                the few interactive lesson stars; raycast hover + click.
├── star-model.ts                PURE (no three): ConstellationState → Star3D[]: real asterism
│                                geometry, per-star spectral color/magnitude, state ladder.
│                                SSR-safe, unit-tested. (REFRESHED — OBAFGKM + no-red.)
├── galaxy-model.ts              PURE: courses → sector ring, rank → illumination, article stars
│                                (G1: real article rows), sector → minimap coords. SSR-safe,
│                                unit-tested. (REFRESHED — G1.)
├── usePrefersReducedMotion.ts   (steel, NEW, G2) hook reading matchMedia('(prefers-reduced-motion:
│                                reduce)'); passed into both public entries.
├── glow-texture.ts              shared 128px radial-gradient procedural texture (cached).
├── webgl.ts                     SSR-safe WebGL support detection. Injectable for tests.
├── LoadingSky.tsx               shimmer fallback (cx3d-loading) while the chunk loads / not ready.
├── SectorMinimap.tsx            DOM minimap overlay over the galaxy: one dot per sector, click-to-fly.
├── StarTooltip.tsx              DOM tooltip anchored to a star's screen %; cx3d-tooltip token.
└── constellations-3d.test.tsx    20 tests: pure models (incl. OBAFGKM/no-red + G1 article),
                                WebGL gate, DOM HUD chrome.
```

**Responsibilities boundary:** pure-model files (`star-model`, `galaxy-model`) are testable and SSR-safe; scene + shader files are browser-only; the two public entries are the only server-page-facing surface. Keeps three out of the server bundle. GLSL lives in exported `.glsl.ts` string files (no raw-loader build config needed in Next.js App Router).

---

## 3. Data wiring plan (AC-2)

Source of truth remains the `completion_events` log (owner-scoped via RLS, no schema redesign other than G1).

```
completion_events (RLS, owner-scoped)
   │
   ├── course_id + lesson_slug (lesson rows) ──► ConstellationState.stars[].lit  (server loader)
   │      │  buildConstellation (src/lib/sky.ts) → per-series stars, lit flag
   │      └──► on-course SeriesScene draws lit stars as ignited; current slug pulses.
   │
   ├── course_id aggregation ──► ConstellationState.complete / litStars (course → constellation)
   │      buildGalaxyModel maps each completed / in-progress / unstarted course to a galaxy SECTOR.
   │
   ├── event_type 'article' (NEW, G1) ──► free-floating ArticleStar[] in the galaxy interior
   │      galaxy-model sources from chronicle rows with event_type === "article" (already updated).
   │
   └── lesson count + course count ──► deriveRank → RankId ──► RANK_ILLUMINATION (galaxy luminance)
            rank maps to how much of the galaxy is lit (Starseed 0.10 → Celestial 1.00).
```

**Course → constellation mapping (authored, not derived):** each course maps to a real named constellation whose (Bayer-designated) member stars are authored with real coordinates, spectral class, and apparent magnitude. Lesson count must equal member-star count used; where a course has more lessons than bright members, map the overflow to progressively fainter real members of that constellation. No DB change; content wiring at the loader (`buildConstellation`). Example: Salesforce Architect → **Orion** (belt Alnitak/Alnilam/Mintaka, Betelgeuse red supergiant, Rigel blue-white, M42 sword as completion anchor), Agentic AI → **Cassiopeia** (the W).

**Article event type (G1):** an additive migration widens the `event_type` CHECK to include `'article'` (Postgres drop + re-add, same pattern as migration 010). Write site: a blog post read by a signed-in user appends one `article` event (idempotent by user + event_type + lesson_slug = post slug). `galaxy-model` (already updated) scatters real article stars. **This is a follow-up migration** because shipping it touches a live constraint; steel must NOT run it blind. If the blog-read write site is deferred, ship it as a separate card so the galaxy falls back gracefully (zero article stars until the source exists).

---

## 4. Performance strategy (AC-3)

- **GPU-first.** The constellation field + background are ONE `Points` buffer drawing the real asterism + field stars with per-star shader attributes — thousands of stars, minimal draw calls, per-star variance computed on GPU, never per-star JS animation. The interactive lesson stars remain higher-fidelity `IgnitedStar` sprites (fine for ~29 lessons).
- **DPR cap:** `dpr={[1,2]}`, `gl={{ antialias: true, powerPreference: 'high-performance' }}` (already in `ConstellationCanvas`).
- **Lazy-load:** the whole three/r3f chunk behind `next/dynamic(..., { ssr: false })` on the two public entries; blog pages never import three. Verified no top-level three import in `src/app` layout/lib.
- **frameloop:** the render loop is cheap (sprite `useFrame` + damped lerps). Add `frameloop="demand"` only if profiling shows a hot idle loop; do not add complexity speculatively.
- **Reduced motion (G2):** `usePrefersReducedMotion` reads `matchMedia` and drives `staticMode`, skipping the ignition sequence, disabling drift/parallax/film-grain/camera breathing, and settling the camera. `@media (prefers-reduced-motion: reduce)` (design tokens) already zeroes DOM transitions + shimmer.
- **Shared local server note:** the audit chain (lara/zod/val-el) shares one llama-server; do not add heavy GPU/render work to their path — the 3D scenes are per-learner browser work, not server render.

---

## 5. Bundle-weight plan

three core (~150-600KB gzipped) sits behind the dynamic import. The public entries ship a few-KB shell; the heavy r3f chunk loads only on `/learn/[series]` and `/profile`. Blog, home, hub, tags, search, and the certificate page stay three-free (no top-level import). The WebGL gate means no-WebGL clients download nothing extra — the chunk is never requested when the gate is false at client mount (via the `useState` initializer in `SeriesConstellation3D` / `ProfileGalaxy3D`).

---

## 6. Contracts (the refreshed interface types)

The cross-sub-task contract types live in the pure model files (owned by brainiac, READ-ONLY to steel). Steel IMPORTS from them; it does NOT edit them. Key additions:

- `star-model.ts`: `SpectralClass` (`"O"|"B"|"A"|"F"|"G"|"K"|"M"`), `SPECTRAL_ARC` (real color-temperature ramp), `BETELGEUSE_ACCENT` (ADR-303), refreshed `STAR_PALETTE` (no-red, warm finish), `Star3D.spectralClass`/`magnitude`/`isRedGiantAccent`, helpers `spectralColorFor`/`magnitudeSizeFor`/`spectralFor`.
- `galaxy-model.ts`: `ArticleStar` sourced from `eventType === "article"` (G1).
- `contracts-constellations.ts`: `CompletionEventType` widened with `"article"` (G1).

---

## 7. Build decomposition → steel (t_4181dffd)

Ordered, dependency-explicit. The scaffold already passes 20 unit tests + typecheck; steel's work is **closure, not greenfield**, verified against the gates below. Full plan posted as the `decomposition-plan:` comment on this card.

1. **Close G2 reduced-motion** (no dependency) → add `usePrefersReducedMotion` hook; wire it into `SeriesConstellation3D` + `ProfileGalaxy3D` prop flow. Produces: hook + wiring. Depends: none.
2. **Close G1 article event** (no implementation dependency, parallel with 1) → migration widening `event_type` to `'article'` + blog-read write site + `galaxy-model` sourcing from `article` rows (model already updated). Produces: migration SQL, write site, updated `galaxy-model` + tests. Depends: none.
3. **On-course tracker (Orion) — real asterism + shader layer** → author real-asterism data (Orion: belt, Betelgeuse, Rigel, M42), build `starfield-gl.ts` + `star-material.glsl.ts` + `nebula-gl.ts`, wire the full EffectComposer chain, Keplerian parallax + cinematic camera, ignition + interaction on `/learn/[series]`. Produces: working Orion tracker. Depends: none (parallel with 1/2).
4. **Profile galaxy** → real-constellation sectors, article stars, cinematic camera flight, minimap, rank → illumination. Produces: working galaxy. Depends: 3 (reuses the shader layer).
5. **Integrate + verify** → full build (`npm run build`), full test suite, reduced-motion check, WebGL-fallback check, no-three-on-blog check (bundle trace), shader-attribute contract check. Produces: green build + green suite. Depends: 1, 2, 4.

---

## 8. ADRs (Architecture Decision Records)

- **ADR-301 — Three.js (r3f) over D3/SVG for the immersive layer.** The ask is bloom, depth, parallax, camera flight; D3 renders flat charts and cannot deliver them (engine LOCKED). r3f keeps three declarative in React. Consequence: ~150-600KB bundle that MUST be lazy-loaded, not for server render.
- **ADR-306 (Rev 2) — Custom GLSL + GPU-first over stock drei + single bloom.** Stock helpers read as tutorial-level and cannot deliver per-star variance at scale, procedural nebula, or cinematic depth. Custom shaders on a single `Points` buffer + procedural fragment shaders are required. Consequence: shader authoring + testing; GLSL in exported string files.
- **ADR-307 (Rev 2) — Real-astronomy grounding over invented/generic space.** States, colors, and asterism geometry map to real constellations, spectral classes, and stellar-evolution moments. Consequence: authored real-asterism data (coordinates, spectral class, magnitude) at the loader; no invented scatter.
- **ADR-302 — Stars as layered additive light, never drawn strokes.** (Retained.) A lit star is a white-hot core over a tinted glow over a soft bloom, with per-star variation.
- **ADR-303 — Red is brand chrome, never a general star colour.** (Retained, with one accuracy exception for astronomically-red members like Betelgeuse.) Lit/captured stars are warm luminous.
- **ADR-304 — completion_events stays the sole source of truth; article added additively.** No per-kind tables; the existing RLS + idempotent write pattern extends to the `article` event (G1). Consequence: a CHECK-widening migration.
- **ADR-305 — Pure model layer, dumb scenes.** `star-model` / `galaxy-model` derive geometry deterministically with no three/r3f imports, so HUD chrome and tests share one SSR-safe source. Consequence: scene files are thin converters; all design math is unit-tested.

---

## 9. Acceptance criteria (QA gate, extends DoD)

1. (AC-1) Component map above exists with the listed files; each has one responsibility.
2. (AC-2) Real-asterism data wired: course → real constellation (Orion/Cassiopeia), lesson-per-member-star, per-star spectral color + magnitude; completion_events → lit stars; article event type wired (G1); the galaxy uses real `article` rows, not lesson rows.
3. (AC-3) Full-advantage bar met: single `Points` buffer starfield with per-star shader attributes + procedural nebula shader (zero texture assets) + cinematic/parallax camera + full EffectComposer chain (bloom + CA + vignette + grain). Not stock drei + single bloom.
4. (AC-4) dpr cap 2, lazy-load in place, reduced-motion honored (G2), no three on blog pages.
5. (AC-5) This document rendered as `docs/system-architecture.html`.
6. (AC-6) File-by-file contract present with acceptance gates steel can execute.
7. `npm run build` + `npm test` green; WebGL-fallback renders the 2D layer on no-WebGL; reduced-motion shows a static lit state.
8. (AC-7) Visual review: the result reads as REAL, deep, immersive astronomy — NOT generic space, NOT clip-art circles, NOT "first-year." Chris signs off on the visual before release.

---

## 10. Risks

- **Shaders are the hardest, highest-risk work** → build the starfield shader as a small isolated proof first; unit-test attribute wiring; keep a stock-material fallback path so the interactive layer degrades cleanly if a device rejects the shader.
- **Article-event migration touches a live CHECK** → do not run it as part of a bundled commit without the write site; if deferred, ship as a separate card so the galaxy falls back gracefully (zero article stars until the source exists).
- **Bundle on /profile and /learn** → lazy import verified; watch that a future shared-layout refactor does not reintroduce a top-level three import (bundle-trace gate in integrate).
- **Real-asterism data accuracy** → author from a canonical source (e.g. IAU constellation charts / Bayer designations); do not hand-invent positions.
- **Shared GPU/browser perf on low-end devices** → WebGL gate + dpr cap + reduced-motion reduce the worst case to the 2D layer.
- **Creativity drift back to generic space** → the AC-7 visual sign-off gate is non-negotiable; the hard rejection floor ("reads as generic space") applies to every visual checkpoint.
