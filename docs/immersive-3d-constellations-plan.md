# Immersive Three.js Constellations — Handoff Plan for the Web Dev Team

> **SUPERSEDED (2026-09-04):** Visual direction for the constellation 3D layer is now **Hubble Field** (Rev 3). See `docs/hubble-field-north-star.md`, `docs/requirements-hubble-field.md`, and `docs/arch-hubble-field.md`. This document is retained as historical record of the Rev 2 handoff plan. Do not implement from this file.

**Status:** PLAN ONLY (REV 2, 2026-09-02). In-flight kanban work cancelled 2026-09-02. This document is the single source of truth for the Web Dev team to rebuild the feature. Rev 2 supersedes Rev 1's design direction: the visual language has been rebooted from scratch on a **real-astronomy grounding** and the engine is now specced to take **full advantage of Three.js** (custom GLSL, GPU-first). Rev 1 color tokens and mockups are demoted to reference artifacts only.

**IMPORTANT — creative reboot (Chris, 2026-09-02).** Rev 1 was rejected: kara's initial design docs read as **generic space / "first-year stuff."** Chris is not satisfied with the direction and explicitly wants DEEP CREATIVITY and a WOW-grade result. Rev 2 therefore reboots the visual language from scratch with three hard mandates that must not be lost:
1. **Real astronomy grounding, NOT a Kryptonian/DC-lore theme.** Chris rejected the Kryptonian heritage framing. The visual language must be anchored in real-world astronomy and space as they actually are — real constellations, real stellar physics, real depth.
2. **Full advantage of Three.js.** The spec must reach under the hood: custom GLSL shaders, GPU-first rendering, procedural nebula, cinematic camera. Stock drei helpers + bloom alone are insufficient and read as tutorial-level.
3. **True immersion (the one approved creative throughline).** Chris explicitly kept "break the flat 2D figure-ground" from the rejected direction. The experience must place the learner INSIDE a real depth of sky — real 3D parallax, volumetric dust, depth fog — not in front of a poster of stars.

**Design ownership:** The Web Dev team owns the final visual language and build. kara's prior artifacts are input/reference only, NOT approved direction. kara is NOT being asked to iterate on her old docs — she reboots concept on a clean slate where "reads as generic space" is a hard rejection floor.

**Tenant:** adroit-blog · **Upgrade of:** B-18/B-19 "Constellations + Chronicle" (already shipped)
**Engine (LOCKED):** Three.js via react-three-fiber (r3f) + drei + @react-three/postprocessing (UnrealBloom). D3 is NOT in the main path.
**App:** Next.js (16.3.0, App Router)

---

## 1. The Vision (what we are building)

Chris wants the Adroit Learn course-tracking experience to be a truly immersive celestial experience, not a boring list. Two surfaces:

1. **On-course tracker** — the Learn course page (e.g. Salesforce System Architect Primer Constellation, 29 lessons). The constellation floats in real 3D; the learner is INSIDE the sky, not looking at it. Ignited stars bloom; unlit stars are faint pinpricks; the current lesson star pulses; on load the lit stars surge on one-by-one in lesson order; hovering a star lifts it + shows a lesson tooltip; clicking flies to the lesson. Background: real-depth starfield (per-star parallax shells) + procedural nebula.
2. **Profile galaxy** — a navigable journey. Every course = a real constellation in its own 3D sector; completed constellations fully lit, in-progress partially lit, unstarted faint. Free-floating stars from blog article reads scattered through the galaxy. The camera flies between constellations (smooth tween) or jumps via a minimap. The rank ladder (Starseed → Celestial) maps to how much of the galaxy is lit.

**Build order:** course tracker first, profile galaxy second.

---

## 2. Locked Decisions (do not re-litigate)

- **Engine: Three.js** (react-three-fiber + drei + UnrealBloom). Chris: "whichever tool we can use to really immerse this." Three.js is the only option that can do bloom/parallax/camera-flight/custom-shaders. D3 renders flat charts and is out of the main path.
- **Full-advantage posture:** custom GLSL shaders and GPU-first techniques are REQUIRED, not optional. See section 6. Stock drei `<Stars>`/`<Float>` + a single bloom pass is explicitly insufficient.
- **Course → constellation mapping (real asterisms):** Salesforce Architect → **Orion**, Agentic AI → **Cassiopeia**. Authored charts where star count = lesson count (star-per-lesson, already satisfied by `buildConstellation`). Where a real constellation has fewer bright member stars than a course has lessons, the remaining lesson-stars are fainter real field members of that constellation (its Bayer-designated stars), NOT invented scatter — the constellation is drawn as it actually appears.
- **Real stellar physics drives the color language.** Ignited/completed states are warm luminous (white-gold / yellow-white / warm), consistent with a real star's photosphere at the finish of its arc. Red is NOT a general star color — it reads as alert and stays reserved for Kryptonian brand chrome (nav pill, certificate finish-line). Minor orange-red tint is permitted ONLY where astronomically justified on a specific named star (e.g. Betelgeuse in Orion is genuinely a red supergiant) — it is an exception for accuracy, never a general ignited-state color.
- **The constellation IS the lesson map.** Click a star to open the lesson; the text list demotes to mobile/a11y fallback.
- **3D layer is ADDITIVE on the shipped 2D system.** Nothing replaces the existing 2D components; the 3D layer is progressive enhancement with graceful WebGL fallback to the 2D layer.
- **Source of truth stays the `completion_events` log** (RLS, owner-scoped). No schema redesign except one additive migration (G1, below).
- **Release:** feature bump → adroit-blog **v1.1.0**, release name **celestial-immersion** (proposed, not yet cut).

---

## 3. Creative Direction (REV 2 — real astronomy; supersedes Rev 1)

### 3.0 Creative reboot statement
Rev 1 was generic space and was rejected as "first-year stuff." The problem was not the rendering — it was that there was no real substance behind the aesthetic. Real astronomy is the well Chris has chosen: real space is stranger, more specific, and more beautiful than the generic version. Every visual decision below is derived from something real that people actually observe and photograph, and the design language is to be built around Three.js's strengths from day one.

### 3.1 Surface archetype
This is a **Monitor surface with an Explore navigation layer**. The learner watches their progress accrue as a living sky; the "hero" is the 3D celestial field itself, not copy. The profile galaxy adds a navigable journey (Explore) on top of the Monitor aggregate. Do NOT give the galaxy a marketing hero + three feature cards.

### 3.2 One-line direction
> "You are an observer of a real, deep sky. Every lesson you complete re-lights a star of a real constellation — a faint pinprick blooms into a burning sun. Your learning record is a sky you bring back to life, asterism by asterism, from a single faint constellation to a fully-illuminated galaxy."

Conceptual anchor: **real stellar ignition** — a cold, dim body igniting into a luminous star (protostar → main sequence → red-giant/white finish). The learner re-lights real asterisms in the real order of their stars.

### 3.3 Real stellar color language (the core decision — REV 2)
Instead of an invented "cyan → gold → white" ladder, states map to a physically-real stellar arc and are tuned so the FINISH is warm luminous (never alert-red):
- **Unlit (available, unborn):** faint cool field star / protostar — a dim, desaturated cool point. NO bloom. It is present but not yet burning.
- **Current (you are here):** a cool blue-white A/B-class point with a soft pulsing halo — reads as "this star is the one you are studying now." Low bloom pulse.
- **Ignited (fusion moment):** the star ignites onto the main sequence — a warm yellow-white (G-class, Sun-like) bloom. Medium bloom. This is the core reward color: warm, bright, alive.
- **Complete (finished):** white-hot / warm white finish — the brightest, most luminous state. Highest bloom. (NOT red.) Optionally, a completed asterism's true giant members (e.g. Betelgeuse in Orion) may show their authentic orange tint as an accuracy accent.
- **Connecting rail:** thin additive line between lit/current stars tracing the real asterism's connecting figure.

This keeps the warm/luminous finish Chris wants while anchoring every state in a real astrophysical moment. Per-star color variation (color temperature, magnitude, size) derives from each star's real spectral class and apparent magnitude.

### 3.4 Bloom + post-processing (full advantage)
A full `@react-three/postprocessing` EffectComposer chain, not a single stock bloom:
- **UnrealBloom** tuned per-state (unlit 0, current low, ignited medium, complete highest) — only lit/current/complete bloom; unlit pinpricks and background dust stay below threshold.
- **Chromatic aberration** on ignited/complete stars only (subtle, gives the hot star a slight spectral fringe).
- **Vignette** to focus the eye and deepen the sense of being inside a field.
- **Subtle film grain** tied to state (rising faintly during ignition for atmosphere), kept tasteful.
All composited on GPU in one pass chain.

### 3.5 Real sky palette (restrained — NOT generic rainbow space)
Real astrophotography palette: deep near-black navy canvas, cool blue-white field stars, warm golden-white ignited stars, faint warm amber toward completed regions, deep violet for dust depth. The **Milky Way band** of unresolved field stars runs subtly behind the constellations. Reads as a real deep-sky field, not a rainbow.

### 3.6 Rank ladder → galaxy illumination
Rank maps to how much of the galaxy is lit. The galaxy's overall luminance = rank (unchanged from Rev 1 mechanics).
- starseed: 1 sector faintly lit (0.10)
- wayfarer: a few sectors partially lit (0.30)
- explorer: ~half the galaxy lit (0.55)
- polestar: most sectors lit, bright (0.80)
- celestial: whole galaxy fully lit, warm (1.00)

### 3.7 Component states
locked (faint pinprick, no bloom, no line) · in-progress (current-star pulse + pulsing halo) · ignited (warm luminous bloom) · complete (white-hot flare) · loading (static unlit + shimmer) · empty (0 lit, editorial copy) · error (unlit + inline retry, never crash) · no-webgl (fall back to 2D).

**Responsive:** desktop = full 3D canvas. ≤768px = compact constellation (fewer stars, camera pulled back) or 2D fallback. Interactive star hit targets ≥44px on touch.

---

## 4. Design History (the journey — do not repeat the mistakes)

Rev 1 iterations (rejected / superseded):
- v1: Orion as a flat chart → "boring list, zero imagination"
- v2: warm gold stars → "star-esque color, not red"
- v3: natural variation (varied rays/tilts) → "worse, looks like lines"
- v4: layered-light glowing stars → "reads as real stars"
- v5: Three.js proof (bloom, parallax, camera drift) → "on the right path" but NOT final
- **v6 / Rev 2 reboot:** generic-space + stock-Three.js rejected as "first-year stuff." Rebooted on real-astronomy grounding + full-advantage Three.js + true immersion.

**Hard-won design lessons (a future session must start knowing these):**
- **Stars are layered LIGHT, not drawn strokes.** A lit star is a glowing round point of light — white-hot center over a tinted core over a soft bloom. Do NOT draw stars as thin vector lines/crosses ("just looks like lines"). Layered additive glow sprites are the fix.
- **Vary every star — never identical.** Vary per star: real color temperature by spectral class, size by apparent magnitude, and a staggered twinkle (unique duration + phase). Uniform stars read as emoji/clip-art. At full-advantage scale, per-star variance is done in the shader, not per-star JS.
- **Red is NOT a general star color.** Red reads as alert. Reserved for Kryptonian brand chrome and astronomically-justified exceptions (Betelgeuse). Ignited stars are warm luminous.
- **Reach for Three.js, not SVG** — and then take FULL advantage of it: custom shaders + GPU-first + cinematic camera, not stock helpers alone. Stock drei + single bloom reads as tutorial-level.
- **No invented generic space.** Generic space (starfield + glow + bloom with nothing real behind it) is exactly what was rejected. Anchor the aesthetic in real astronomical structure.
- **Immersion over flat figure-ground.** Real depth parallax + volumetric dust + depth fog. The learner is inside the sky.

---

## 5. Architecture (brainiac's plan — retained from Rev 1, extended)

### 5.1 Component decomposition
All paths under `src/components/Constellations/3d/`. Public entry components are lightweight and server-page-safe; the full three/r3f stack is `next/dynamic(..., { ssr: false })` behind them so blog pages never pull three.

```
src/components/Constellations/3d/
├── ConstellationCanvas.tsx      r3f <Canvas> shell: EffectComposer (bloom + CA +
│                                vignette + grain), dpr cap [1,2], WebGL gate,
│                                LoadingSky until first frame.
├── SeriesConstellation3D.tsx    PUBLIC on-course entry. Lazy-imports canvas + scene;
│                                WebGL gate → 2D SeriesConstellation fallback; hosts
│                                StarTooltip; owns lesson-click navigation.
├── SeriesScene.tsx              r3f on-course scene: builds StarField from the
│                                constellation (real asterism), renders shader stars +
│                                connecting rails, ignition sequence, damped camera
│                                drift + Keplerian parallax, raycast → StarTooltip +
│                                click-to-fly.
├── ProfileGalaxy3D.tsx          PUBLIC profile-galaxy entry. Lazy-imports canvas +
│                                scene; WebGL → fallback 2D; overlays SectorMinimap +
│                                chrome; owns sector → learn navigation.
├── ProfileScene.tsx             r3f galaxy scene: SectorConstellation per course on
│                                an XZ ring, free-floating article stars, cinematic
│                                camera flight between sectors, rank → illumination.
├── starfield-gl.tsx             <points> Stars as ONE Points buffer with per-star
│                                shader attributes (colorTemp, magnitude, twinkle
│                                phase/speed, spectral class). Custom RawShaderMaterial.
├── nebula-gl.tsx                Procedural noise (fbm/simplex) nebula shader — zero
│                                texture assets; volumetric billboard layer + Milky Way
│                                band of unresolved stars.
├── star-material.glsl.ts        Custom star shader (vertex + fragment) as exported
│                                GLSL strings — per-star drift, temperature gradient,
│                                spectral spike cross, opacity noise.
├── IgnitedStar.tsx              Individual layered-light star (bloom + mid + core) for
│                                the few interactive lesson stars; raycast hover + click.
├── star-model.ts                PURE (no three): ConstellationState → Star3D[]: real
│                                asterism geometry, per-star spectral color/magnitude,
│                                state ladder. SSR-safe, unit-tested.
├── galaxy-model.ts              PURE: courses → sector ring, rank → illumination,
│                                article stars, sector → minimap coords. SSR-safe, unit-tested.
├── glow-texture.ts              shared 128px radial-gradient procedural texture (cached).
├── webgl.ts                     SSR-safe WebGL support detection. Injectable for tests.
├── LoadingSky.tsx               shimmer fallback (cx3d-loading) while chunk loads.
├── SectorMinimap.tsx            DOM minimap overlay over the galaxy: dot per sector.
├── StarTooltip.tsx              DOM tooltip anchored to a star's screen %.
└── constellations-3d.test.tsx   17+ tests: pure models, shader attribute wiring, WebGL
                                gate, DOM HUD chrome.
```

**Responsibilities boundary:** pure-model files (`star-model`, `galaxy-model`) are testable and SSR-safe; scene + shader files are browser-only; the two public entries are the only server-page-facing surface. Keeps three out of the server bundle. GLSL lives in exported `.glsl.ts` string files (no raw-loader build config needed in Next.js App Router).

### 5.2 Data wiring
Source of truth remains the `completion_events` log (RLS, owner-scoped).
- `course_id + lesson_slug` (lesson rows) → `ConstellationState.stars[].lit` via `buildConstellation` (src/lib/sky.ts) → on-course SeriesScene lights the real asterism's stars; current slug pulses.
- `course_id` aggregation → `ConstellationState.complete / litStars` → `buildGalaxyModel` maps each course to a galaxy SECTOR (a real constellation).
- `event_type 'article'` (NEW, G1) → free-floating ArticleStar[] in the galaxy interior, sourced from chronicle rows with `event_type === "article"`.
- lesson count + course count → `deriveRank` → `RankId` → `RANK_ILLUMINATION` (galaxy luminance).

**Course → real constellation data:** authored, not derived. Each course maps to a real named constellation whose (Bayer-designated) member stars are authored with real coordinates, spectral class, and apparent magnitude. Lesson count must equal member-star count used; where a course has more lessons than bright members, map the overflow to progressively fainter real members of that constellation. No DB change; content wiring at the loader (`buildConstellation`).

### 5.3 Performance strategy
- **GPU-first.** The constellation field and background are ONE `Points` buffer drawing the real asterism + field stars with per-star shader attributes — thousands of stars, minimal draw calls, per-star variance computed on GPU, never per-star JS animation.
- **DPR cap:** `dpr={[1,2]}`, `gl={{ antialias: true, powerPreference: 'high-performance' }}`.
- **Lazy-load:** whole three/r3f chunk behind `next/dynamic(..., { ssr: false })` on the two public entries; blog pages never import three.
- **frameloop:** cheap render loop. Add `frameloop="demand"` only if profiling shows a hot idle loop.
- **Reduced motion (G2):** `usePrefersReducedMotion` drives `staticMode`, skips ignition + drift + parallax, settles camera, disables the film-grain/camera breathing. `@media (prefers-reduced-motion: reduce)` zeroes DOM transitions + shimmer.
- **Shared local server note:** the audit chain (lara/zod/val-el) shares one llama-server; do not add heavy GPU/render work to their path — 3D scenes are per-learner browser work, not server render.

### 5.4 Bundle-weight plan
three core (~150-600KB gzipped) sits behind the dynamic import. Public entries ship a few-KB shell; the heavy r3f chunk loads only on `/learn/[series]` and `/profile`. Blog, home, hub, tags, search, certificate page stay three-free. WebGL gate means no-WebGL clients download nothing extra.

---

## 6. Full Advantage of Three.js (NEW in Rev 2 — the engine mandate)

Stock drei helpers + a single bloom pass is what produced the "first-year" feel. Rev 2 REQUIRES reaching under the hood. These techniques are the creative differentiators and the acceptance bar:

### 6.1 Custom GLSL shaders (the biggest unlock)
- **Single `Points` buffer starfield** with a custom `RawShaderMaterial`. Per-star attributes: `aColorTemp` (spectral color), `aMagnitude` (size/brightness), `aTwinklePhase` + `aTwinkleSpeed` (unique per star), `aSpike` (spectral diffraction-cross intensity). Thousands of stars, zero per-star draw calls, and NONE identical — the anti-clip-art rule enforced at the GPU level.
- **Twinkle is a shader time-uniform**, never JS-per-star setTimeout. Staggered twinkle across thousands of stars for free via `uTime + aTwinklePhase`.
- **Star drift / shimmer** computed in the vertex stage with per-star noise, so the field feels alive without a hot JS loop.
- **Procedural nebula shader** (fragment fbm/simplex noise) as a volumetric billboard layer + a **Milky Way band** of unresolved faint stars. Zero texture assets; infinite, and it genuinely shifts under the camera.
- **Depth fog** between camera and constellation so the field reads as deep, not flat.

### 6.2 Shader uniforms = the design system
The real stellar color-temperature arc (dim cool → warm ignited → white-hot complete) becomes ONE `uColorTemp`/`uState` uniform ramped per star, so state transitions are buttery GPU interpolations, not discrete color swaps. The ignition surge is a shader-driven wave (uniform per star order), not per-star setTimeout.

### 6.3 Camera as a character
- **Keplerian parallax**: stars sit on multiple depth shells at real relative distances and shift at different rates as the camera moves, so the sky genuinely has depth and rotates around the observer. (Real parallax is an astronomical effect — this is physically honest immersion.)
- **Cinematic flight** (galaxy): r3f `useFrame` + damped easing (maath) into a dolly-and-tilt pattern with camera keyframes, lookAt slewing, and subtle FOV breathing on ignition. Not a bare position lerp.
- **On-course drift + pointer parallax** so the constellation feels like you are drifting through it.

### 6.4 Post-processing chain
Full EffectComposer: UnrealBloom (per-state tuned) + subtle chromatic aberration on hot stars + vignette + restrained film grain tied to state. Composites on GPU in one pass.

### 6.5 Ignition light-scatter
The fusion moment gets a real light bloom / scatter flare (a sprite that flairs as the star ignites), not just a pinned sprite color swap.

**Perf honesty at full power:** all of the above scales because it is GPU-side — `Points` for stars, fragment shaders for nebula, one EffectComposer chain. Stays within the dpr cap + lazy-load discipline. `Points`/shaders replace the Rev 1 per-star 3-sprite approach for scale; the interactive lesson stars remain higher-fidelity individual sprites (see `IgnitedStar`).

---

## 7. Known Gaps (steel's work — the two real items)

| # | Gap | Why it matters | Required change |
|---|---|---|---|
| G1 | `article` event type not real | Profile galaxy scatters free-floating stars from blog reads as a new `article` event. Today `galaxy-model.ts` fabricates them from `lesson` events (wrong data). | DB migration widens the `event_type` CHECK to include `article`; a write site appends an `article` event when a signed-in user reads a blog post; `galaxy-model.ts` sources article stars from `chronicle` rows whose `event_type === "article"`. |
| G2 | `prefers-reduced-motion` inert | The gate exists in the scene code but defaults to `false` and is never bound to `matchMedia('(prefers-reduced-motion: reduce)')`, so reduced-motion users still get ignition, drift, tweening. A11y regression vs the shipped 2D layer. | A `usePrefersReducedMotion` hook reads `matchMedia` and is passed into `SeriesConstellation3D` + `ProfileGalaxy3D`; it disables ignition, parallax, drift, film-grain, and camera breathing. |

**G1 is a follow-up migration** because shipping it touches a live CHECK constraint; do NOT run it blind. If the blog-read write site is deferred, ship it as a separate card so the galaxy falls back gracefully (remove the placeholder only when the source exists).

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

## 9. Build Decomposition (ordered, dependency-explicit)

0. **Creative concept sprint (kara — NEW in Rev 2, clean slate).** Kara produces a fresh concept — real-astronomy grounding, reference board, color/motion language — NOT iterating on Rev 1 docs. Rejection floor: "reads as generic space" = rejected. Web Dev team takes this as creative input and owns the final visual language. Produces: concept brief + reference board (input for step 1).
1. **Web Dev build: course tracker (Orion) first.** Real-asterism data + starfield shader + post chain + parallax + ignition + interaction on `/learn/[series]`. Web Dev owns the final visual. Produces: working Orion tracker.
2. **Close G2 reduced-motion** (no dependency) → add `usePrefersReducedMotion`; wire into both entries + disable parallax/drift/grain/breathing. Produces: hook + wiring.
3. **Close G1 article event** (no implementation dependency, parallel with 2) → migration widening `event_type` to `'article'` + blog-read write site + `galaxy-model` sourcing from `article` rows. Produces: migration SQL, write site, updated `galaxy-model` + tests.
4. **Profile galaxy.** Real-constellation sectors, article stars, cinematic camera flight, minimap, rank → illumination.
5. **Integrate + verify** → full build (`npm run build`), full test suite, reduced-motion check, WebGL-fallback check, no-three-on-blog check (bundle trace), shader-attribute contract check. Produces: green build + green suite.

---

## 10. Acceptance Criteria (QA gate)

1. (AC-1) Component map above exists with the listed files; each has one responsibility.
2. (AC-2) Real-asterism data wired: course → real constellation (Orion/Cassiopeia), lesson-per-member-star, per-star spectral color + magnitude; completion_events → lit stars; article event type wired (G1); the galaxy uses real `article` rows, not lesson rows.
3. (AC-3) Full-advantage bar met: single `Points` buffer starfield with per-star shader attributes + procedural nebula shader (zero texture assets) + cinematic/parallax camera + full EffectComposer chain (bloom + CA + vignette + grain). Not stock drei + single bloom.
4. (AC-4) dpr cap 2, lazy-load in place, reduced-motion honored (G2), no three on blog pages.
5. (AC-5) Architecture rendered as `docs/system-architecture.html`.
6. (AC-6) File-by-file contract present with acceptance gates steel can execute.
7. `npm run build` + `npm test` green; WebGL-fallback renders the 2D layer on no-WebGL; reduced-motion shows a static lit state.
8. (AC-7) Visual review: the result reads as REAL, deep, immersive astronomy — NOT generic space, NOT clip-art circles, NOT "first-year." Chris signs off on the visual before release.

---

## 11. Risks

- **Shaders are the hardest, highest-risk work** → build the starfield shader as a small isolated proof first; unit-test attribute wiring; keep a stock-material fallback path so the interactive layer degrades cleanly if a device rejects the shader.
- **Article-event migration touches a live CHECK** → do not run it as part of a bundled commit without the write site; if deferred, ship as a separate card so the galaxy falls back gracefully.
- **Bundle on /profile and /learn** → lazy import verified; watch that a future shared-layout refactor does not reintroduce a top-level three import (bundle-trace gate in integrate).
- **Real-asterism data accuracy** → author from a canonical source (e.g. IAU constellation charts / Bayer designations); do not hand-invent positions.
- **Shared GPU/browser perf on low-end devices** → WebGL gate + dpr cap + reduced-motion reduce the worst case to the 2D layer.
- **Creativity drift back to generic space** → the AC-7 visual sign-off gate is non-negotiable; the hard rejection floor ("reads as generic space") applies to every visual checkpoint.

---

## 12. Artifacts (reference material, preserved — NOT final design)

> **Read these as input, not gospel.** Rev 1's kara artifacts were flagged as not good enough and are demoted. Rev 2 reboots from scratch on real-astronomy grounding; the Web Dev team owns the final visual language.

- **Rev 1 design (SUPERSEDED reference):** `design/t_3a759160/` (discovery), `design/t_89b4bfbf/` (execution) — direction briefs, `design-tokens-3d.css`, mockups, screenshots. Keep ONLY for the durable lessons (section 4) and component-state mechanics. Do NOT reuse the color tokens or generic-space look.
- **Architecture (Rev 1, retained + extended by Rev 2):** `docs/arch-immersive-3d.md` + `docs/arch-immersive-3d-content.html`
- **Reference implementation scaffold (uncommitted):** `src/components/Constellations/3d/` — 15 files, passes 17/17 unit tests + clean typecheck. Reference shape only; must be extended with the Rev 2 shader/GPU-first layer and real-asterism data. Not greenfield, not final.
- **Vault mockups:** `~/.hermes/vault/Adroit Blog/constellations/salesforce-architect-orion-mockup.html` + `orion-three-proof.html`
- **Skill:** `threejs-constellation` (Three.js build guidance, design lessons, pitfalls — update to capture Rev 2 real-astronomy + full-advantage mandates).

---

## 13. Current State / What Was Cancelled

- **Kanban build task `t_07f0daca`** (steel · Build: Immersive Three.js Constellations) — **CANCELLED** 2026-09-02. Not dispatched.
- **Design tasks** `t_3a759160` (discovery) and `t_89b4bfbf` (execution) — **completed**, output demoted to Rev 1 reference (not approved direction).
- **Architecture task** `t_0dbadb9b` (brainiac) — completed (this plan, Rev 1). Rev 2 (this document) extends it.
- The uncommitted implementation scaffold in `src/components/Constellations/3d/` and the design/arch docs remain on disk as reference for the Web Dev team. They are NOT committed to git and NOT deployed.

**Why cancelled / rebooted:** (1) The Fortress system was suffering severe issues (context-compression failures, local LLM instability) and Chris chose to preserve the work as a plan doc rather than risk losing it. (2) Chris reviewed kara's initial design docs and flagged them as not good enough — generic space, "first-year stuff." (3) Chris mandated the creative reboot: real-astronomy grounding, full advantage of Three.js, and true immersion. The Web Dev team owns the final design and build.
