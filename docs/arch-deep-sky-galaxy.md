# System Architecture — deep-sky Profile Galaxy Navigation ("Sky Roads")

> **SUPERSEDED (2026-09-04):** Visual direction for the constellation 3D layer is now **Hubble Field** (Rev 3). See `docs/hubble-field-north-star.md`, `docs/requirements-hubble-field.md`, and `docs/arch-hubble-field.md`. This document is retained as historical record of the Sky Roads (deep-sky v1.2.0) architecture. Do not implement from this file.

**Tenant:** adroit-blog · **Release:** deep-sky v1.2.0
**Architect:** brainiac (task t_2156deb1) · **Pipeline stage → build (steel, t_62a40095), gated by this card**
**Inputs:** kara's approved clean-slate concept (t_ea789325) — `design/t_ea789325/` (direction-brief-sky-roads.md, component-spec-sky-roads.md, design-tokens-sky-roads.css, mockups). **This arch targets kara's FRESH "Sky Roads" concept tokens, NOT the stale rejected generic-space direction.**
**Engine LOCKED:** Three.js via react-three-fiber + drei + @react-three/postprocessing (UnrealBloom). Custom GLSL/GPU-first where it matters. Next.js app (16.3.0, App Router).

The navigable profile galaxy (`/profile` "Your Sky") reboot. The shipped `ProfileScene`/`ProfileGalaxy3D` renders every course's constellation at full fidelity simultaneously — the exact "dense, non-navigable jumble of dots" Chris rejected. The reboot is a **compositional change**: stop showing everything at once, and give the sky a guided-map structure like a video-game world map.

---

## 0. The concept this arch targets (kara's "Sky Roads")

- **LOD — one constellation at a time.** The focused constellation renders at full deep-sky fidelity (all real member stars, per-star lit state, M42 nebula anchor). Every other course is a compact **constellation glyph** — only its recognizable bright-anchor asterism (magnitude < 3.5), drawn at `--glyph-scale` with the same star + diffraction-spike language. The eye is never asked to parse hundreds of simultaneous stars.
- **The Sky Road.** A faint arcing additive route line threads the sectors in recommended learning order. Traveled (behind you) = warm golden; untraveled (ahead) = faint cool dashed.
- **The Frontier Waypoint.** The next recommended sector (first unstarted/in-progress with availability) carries a pulsing cyan reticle ring + a floating "NEXT · [course]" tag, and is the default camera focus on load. This is the clear click affordance and the "what to do next" answer.
- **Camera as a character.** Dolly-and-tilt flight (pull back, arc toward target, decelerate + FOV breath), not a bare position lerp. Overview = sky-chart altitude with slow Keplerian drift + pointer parallax.
- **Achievement states at node scale AND per-star scale.** Every node carries a thin progress arc (lit/total) so "how to achieve it" is legible before you fly there.

**Anti-slop:** this is an Explore surface (primary) with a Monitor aggregate. No marketing hero, no three feature cards, no generic-space starfield. The sky IS the data.

---

## 1. State of the codebase (constraint, not target)

A working 3D scaffold exists in `src/components/Constellations/3d/`. **Verified as of this card:** `npx tsc --noEmit` clean; `npx vitest run` 492/492 pass (75 files); `three@0.185.1`, `@react-three/fiber@9.7.0`, `@react-three/drei@10.7.8`, `@react-three/postprocessing@3.1.1`, `maath@0.10.8` are dependencies; the Learn page and FullSkySection already import the public entries.

**What stays (verified good):** the pure model layer (`star-model.ts` with the real OBAFGKM spectral arc + no-red palette, `galaxy-model.ts` with G1 article-star sourcing), the layered-light `IgnitedStar` sprite stack, `ConstellationCanvas` lazy shell with WebGL gate + `LoadingSky`, `SeriesScene` ignition sequence + damped drift + raycast, `SectorMinimap` / `StarTooltip` DOM overlays, `glow-texture`, `webgl` SSR-safe detection, `usePrefersReducedMotion` (G2 closed).

**What this card rewrites / adds (the "Sky Roads" layer):**

| File | Change |
|---|---|
| `galaxy-model.ts` | **Extended** (pure, SSR-safe, unit-tested): add `glyph` (bright-anchor subset per sector), `focus`, `SkyRoad` (ordered node path + traveled/untraveled segments + Catmull-Rom curve), `frontierSlug` (next waypoint). `buildGalaxyModel` returns `{ sectors, articles, road, frontierSlug }`. |
| `ProfileScene.tsx` | **Rewritten** to the LOD model: one focused constellation at full fidelity + glyph nodes + SkyRoad + WaypointReticle + CameraRig. |
| `SectorMinimap.tsx` → `SkyChart.tsx` | **Upgraded** to show road + traveled/untraveled + you-are-here + next-waypoint + view cone. |
| `StarTooltip.tsx` → `ConstellationCard.tsx` | **Replaced** by the contextual info card (name, course, state chip, lit/total, CTA). |
| `ProfileGalaxy3D.tsx` | **Entry unchanged** — hosts scene + HUD, gates on WebGL, falls back to `fallback2D`. Wires `onSelectSector` → fly + navigate. |
| NEW | `ConstellationGlyph.tsx` (LOD node), `SkyRoad.tsx` (route line), `WaypointReticle.tsx` (pulsing next marker), `JourneyRail.tsx` (waypoint strip), `CameraRig.tsx` (dolly-and-tilt flight), `RankChip.tsx`, `Legend.tsx`. |

**Contract file (NEW):** `src/shared/contracts-galaxy.ts` — the cross-sub-task interface types (see §6). See ADR-308 for why it is not `src/shared/contracts.ts`.

---

## 2. Component decomposition (AC-1)

All paths under `src/components/Constellations/3d/` unless noted. Public entry components are lightweight and server-page-safe; the full three/r3f stack is `next/dynamic(..., { ssr: false })` behind them so blog pages never pull three.

```
src/components/Constellations/3d/
├── ProfileGalaxy3D.tsx        PUBLIC entry (unchanged). Lazy-imports canvas + scene;
│                              WebGL gate → fallback2D; hosts scene + HUD; owns
│                              sector → learn navigation.
├── ProfileScene.tsx           r3f galaxy scene (REWRITTEN to LOD): the focused
│                              constellation at full fidelity + ConstellationGlyph
│                              nodes + SkyRoad + WaypointReticle + CameraRig.
├── ConstellationGlyph.tsx     (NEW) LOD node — the bright-anchor asterism at
│                              --glyph-scale, status halo + progress arc + name label.
│                              Clickable. Consumes ConstellationGlyphProps.
├── SkyRoad.tsx                (NEW) additive route line through node positions;
│                              traveled warm gold, untraveled faint cool dashed.
│                              Consumes SkyRoadProps.
├── WaypointReticle.tsx        (NEW) pulsing cyan ring + "NEXT · [course]" tag on the
│                              frontier node. Consumes WaypointReticleProps.
├── CameraRig.tsx              (NEW) dolly-and-tilt flight controller (3-phase fly,
│                              overview drift + parallax, reduced-motion static).
│                              Consumes CameraRigProps.
├── SkyChart.tsx               (NEW, replaces SectorMinimap) mini sky-road map: node
│                              dots on the route, traveled/untraveled road, you-are-here
│                              pulse, next-waypoint marker, view cone. Click → fly.
├── ConstellationCard.tsx      (NEW, replaces StarTooltip) contextual info card: name,
│                              course, state chip, lit/total, "Continue / Next star" CTA.
├── JourneyRail.tsx            (NEW) horizontal waypoint strip of course names in road
│                              order, state-coded, frontier highlighted, prev/next arrows.
├── RankChip.tsx               (NEW) "EXPLORER · 55% lit" (Monitor aggregate).
├── Legend.tsx                 (NEW) collapsible state key.
├── galaxy-model.ts            PURE (EXTENDED): sectors + glyph + focus + road +
│                              frontierSlug + articles. SSR-safe, unit-tested.
├── star-model.ts              PURE (unchanged): Star3D, OBAFGKM arc, no-red palette.
├── asterism-data.ts           PURE (unchanged): real asterisms, projectAsterism,
│                              overlayAsterism. Glyph subset derives from magnitude<3.5.
├── ConstellationCanvas.tsx    r3f <Canvas> shell (unchanged): EffectComposer, dpr cap,
│                              WebGL gate, LoadingSky.
├── IgnitedStar.tsx            layered-light star sprite (unchanged) — used for the
│                              focused constellation's member stars.
├── usePrefersReducedMotion.ts hook (unchanged, G2 closed).
├── glow-texture.ts / webgl.ts / LoadingSky.tsx   unchanged.
└── constellations-3d.test.tsx  tests extended for road/frontier/glyph (pure) + HUD.
```

**Responsibilities boundary:** pure-model files (`galaxy-model`, `star-model`, `asterism-data`) are testable and SSR-safe; scene + shader files are browser-only; the two public entries are the only server-page-facing surface. Keeps three out of the server bundle.

**State matrix (all components):**

| State | Focused constellation | Glyph node | Road segment | SkyChart dot | JourneyRail chip |
|---|---|---|---|---|---|
| certified | white-hot flare, highest bloom | white-hot halo + diamond badge | traveled (warm gold) | white-hot | white-hot + ✓ |
| completed | warm gold bloom | warm gold figure, steady halo | traveled (warm gold) | warm gold | warm gold |
| in-progress | cyan pulse on current star | partial figure + cyan pulse + progress arc | traveled (warm gold) | cyan | cyan |
| unstarted | (not focused) | faint cool pinprick figure, dim halo | untraveled (faint cool) | faint cool | faint cool |
| next waypoint | - | cyan reticle ring + pulse + "NEXT" tag | segment to it pulses | cyan ring | highlighted + "NEXT" |
| loading | static unlit + shimmer | static unlit | hidden | hidden | hidden |
| empty | starfield, 0 lit, editorial copy | - | - | - | - |
| error | renders unlit + inline retry | - | - | - | - |
| no-webgl | fall back to 2D FullSkySection | - | - | - | - |

**Responsive:** desktop = full 3D canvas. ≤768px = compact (fewer glyphs visible, camera pulled back, focused constellation fills `--focus-fill-mobile`), JourneyRail becomes the primary nav (thumb-reachable), SkyChart collapses to a small toggle. Interactive hit targets ≥44px on touch.

---

## 3. Data wiring (AC-4) — confirmed

**Constellation lighting source of truth (deep-sky v1.2.0 / ADR-211):** the CURRENT set of completed lessons comes from `lesson_completion` (via `getCompletedLessonSlugs` in `src/lib/completion.ts`) — the SAME source the on-course tracker `/learn/[series]` reads. This is the completion-sync fix (folded into the on-course build card). Both surfaces stay consistent after a mark OR an unmark, because an unmark deletes the `lesson_completion` row (which the immutable `completion_events` log does not).

**`completion_events` role:** the append-only HISTORICAL log used to derive rank / streak / chronicle (`deriveProgress`). It is NOT used to light constellations — unmarking a lesson would otherwise leave a stale `lesson` event and the profile sky would show it lit forever.

```
lesson_completion (current-state store, migration 001)   ← constellation LIGHTING
   │  getCompletedLessonSlugs(userId) → Set<lesson_slug>
   ├──► on-course tracker /learn/[series]  (loadSeriesConstellation → buildConstellation)
   └──► profile sky /profile               (loadProfileSky → buildConstellation)
          buildGalaxyModel maps each course → a galaxy SECTOR (state from lit/total + cert)

completion_events (append-only log, RLS owner-scoped)     ← rank / streak / chronicle
   ├── lesson + course events ──► deriveProgress ──► rank (RankId) ──► RANK_ILLUMINATION
   └── article rows (G1) ──► free-floating ArticleStar[] in the galaxy interior
```

**Course → constellation mapping (authored, not derived):** each course maps to a real named constellation whose (Bayer-designated) member stars are authored with real coordinates, spectral class, and apparent magnitude (already in `asterism-data.ts`: Salesforce Architect → Orion, Agentic AI → Cassiopeia). Lesson count = member-star count used; overflow maps to progressively fainter real members. The glyph's recognizable figure = the bright anchors (magnitude < 3.5), the same set `projectAsterism` uses to frame the figure.

**Note on the task brief's phrasing:** the brief says "profile galaxy sources from `completion_events` (single source of truth)". That phrasing predates the completion-sync fix. The accurate, current wiring is: **constellation lighting reads `lesson_completion`** (shared with the on-course tracker), while **`completion_events` remains the source for rank/streak/chronicle**. This is the correct, consistent wiring and satisfies AC-4.

---

## 4. Camera flight spec (CameraRig)

- **Overview:** camera at sky-chart altitude, slow Keplerian drift (`--overview-drift-ms`) + pointer parallax, `--overview-tilt` so you feel inside the volume. Sees the whole atlas.
- **Fly to node (dolly-and-tilt):** 3-phase — (1) pull back slightly, (2) arc toward target along a curved approach (damped easing, maath), banking/tilting so the figure frames correctly, (3) decelerate + subtle FOV breath (`--fly-fov-breath`) on settle. Near field-stars parallax past = sense of travel.
- **Return to overview:** reverse pull-out.
- **Reduced motion:** static settled overview; selecting swaps which node is focused (no flight). `usePrefersReducedMotion` → `staticMode`.
- **Framing:** the focused constellation fills `--focus-fill` (0.60) of viewport height, figure oriented correctly (Orion's belt diagonal, Cassiopeia's W upright).

---

## 5. Performance + bundle (unchanged from the base)

- **GPU-first.** The constellation field + background are ONE `Points` buffer with per-star shader attributes; per-star variance computed on GPU, never per-star JS animation. Interactive lesson stars remain higher-fidelity `IgnitedStar` sprites (fine for ~29 lessons).
- **DPR cap:** `dpr={[1,2]}`, `gl={{ antialias: true, powerPreference: 'high-performance' }}`.
- **Lazy-load:** the whole three/r3f chunk behind `next/dynamic(..., { ssr: false })` on the two public entries; blog pages never import three.
- **Reduced motion:** `usePrefersReducedMotion` reads `matchMedia` and drives `staticMode`, skipping flight/parallax/pulse/shimmer. `@media (prefers-reduced-motion: reduce)` zeroes DOM transitions.
- **Shared local server note:** the audit chain (lara/zod/val-el) shares one llama-server; do not add heavy GPU/render work to their path — 3D scenes are per-learner browser work, not server render.

---

## 6. Contracts (AC-2) — `src/shared/contracts-galaxy.ts`

The cross-sub-task interface types live in `src/shared/contracts-galaxy.ts` (owned by brainiac, READ-ONLY to steel). Steel IMPORTS from it; it does NOT edit it. Key types:

- **Pure model (sub-task 1):** `GlyphStar`, `GalaxySectorNav` (extends `GalaxySector` with `glyph` + `focus`), `SkyRoad` (`nodes`/`traveled`/`untraveled`/`curve`), `FrontierSlug` signature, `GalaxyModel` (the extended `buildGalaxyModel` return).
- **Navigation state:** `CameraMode` (`overview`/`flying`/`settled`), `GalaxyNavigationState` (`focusSlug`/`frontierSlug`/`cameraMode`).
- **Scene (sub-task 2):** `ConstellationGlyphProps`, `SkyRoadProps`, `WaypointReticleProps`, `CameraRigProps`.
- **HUD (sub-task 3):** `SkyChartProps`, `ConstellationCardProps`, `JourneyRailProps`, `RankChipProps`, `LegendProps`.
- **Achievement:** re-exports `SectorState` (unchanged ladder).

Verified: `npx tsc --noEmit` exit 0 with the new file in place.

---

## 7. Build decomposition (AC-3) — posted as the `decomposition-plan:` comment

Three sub-tasks (~35 turns each), each with exact file scope, contracts implemented/consumed, and dependencies. Full plan in the `decomposition-plan:` comment on t_2156deb1. Summary:

1. **Pure model + contracts** — extend `galaxy-model.ts` (glyph, focus, road, frontierSlug) + `contracts-galaxy.ts` (already written) + tests. Produces: extended model + green tests. Depends: none.
2. **Scene LOD + road + waypoint + camera** — rewrite `ProfileScene.tsx`; add `ConstellationGlyph`, `SkyRoad`, `WaypointReticle`, `CameraRig`. Consumes sub-task 1's model. Depends: 1.
3. **HUD + a11y + responsive** — add `SkyChart`, `ConstellationCard`, `JourneyRail`, `RankChip`, `Legend`; wire into `ProfileGalaxy3D`; a11y (arrow-key traversal, focus ring, reduced-motion) + responsive (≤768px). Depends: 1, 2.

---

## 8. ADRs (Architecture Decision Records)

- **ADR-301 — Three.js (r3f) over D3/SVG for the immersive layer.** (Retained.) The ask is bloom, depth, parallax, camera flight; D3 renders flat charts and cannot deliver them (engine LOCKED). Consequence: ~150-600KB bundle that MUST be lazy-loaded, not for server render.
- **ADR-306 (Rev 2) — Custom GLSL + GPU-first over stock drei + single bloom.** (Retained.) Stock helpers read as tutorial-level. Custom shaders on a single `Points` buffer + procedural fragment shaders are required.
- **ADR-307 (Rev 2) — Real-astronomy grounding over invented/generic space.** (Retained.) States, colors, and asterism geometry map to real constellations, spectral classes, and stellar-evolution moments.
- **ADR-302 — Stars as layered additive light, never drawn strokes.** (Retained.)
- **ADR-303 — Red is brand chrome, never a general star colour.** (Retained, with the Betelgeuse accuracy exception.)
- **ADR-304 — completion_events stays the sole source of truth; article added additively.** (Retained for rank/streak/chronicle + article stars.)
- **ADR-305 — Pure model layer, dumb scenes.** (Retained.) `star-model` / `galaxy-model` derive geometry deterministically with no three/r3f imports, so HUD chrome and tests share one SSR-safe source.
- **ADR-211 — Constellation lighting reads `lesson_completion`, not `completion_events`.** (NEW, deep-sky v1.2.0.) The append-only log is immutable; unmarking a lesson deletes the `lesson_completion` row but keeps the event. Lighting from the log would show a stale lit star forever. Both surfaces (on-course + profile) read `getCompletedLessonSlugs` so they stay consistent after mark OR unmark. `completion_events` stays for rank/streak/chronicle.
- **ADR-308 — Galaxy contracts live in `src/shared/contracts-galaxy.ts`, not `src/shared/contracts.ts`.** (NEW.) The brief said `contracts.ts`, but that file is already owned by the quiz-tier arch (t_cf2e9661) and documented "DO NOT EDIT". A dedicated domain-suffixed file follows the existing convention (`contracts-constellations.ts`, `contracts-course-catalog.ts`, `contracts-account.ts`) and avoids a collision hotspot. Steel imports from `contracts-galaxy.ts`.
- **ADR-309 — LOD galaxy: one focused constellation + glyph nodes over full-fidelity-everything.** (NEW.) The shipped "every course at full fidelity simultaneously" is the rejected jumble. Rendering exactly one rich constellation + a handful of legible glyphs keeps the sky readable (game-map principle). Consequence: `GalaxySector.glyph` (bright-anchor subset) + `focus`; the focused sector renders full member stars, others render glyphs.
- **ADR-310 — Sky Road + Frontier Waypoint as the guided-map navigation.** (NEW.) A Catmull-Rom route line threads sectors in journey order (traveled warm gold / untraveled faint cool); the frontier (first unstarted/in-progress with availability) carries a pulsing cyan reticle + "NEXT" tag and is the default camera focus. This is the clear click affordance and the "what to do next" answer. Consequence: `SkyRoad` + `frontierSlug` in the pure model; `WaypointReticle` + `CameraRig` in the scene.

---

## 9. Acceptance criteria (QA gate, extends DoD)

1. (AC-1) Component decomposition above exists; each file has one responsibility; targets kara's "Sky Roads" concept (LOD + road + waypoint), not the rejected generic-space direction.
2. (AC-2) `src/shared/contracts-galaxy.ts` compiles (`npx tsc --noEmit` exit 0) and encodes the sector/navigation/achievement contracts.
3. (AC-3) Build decomposition plan posted as a `decomposition-plan:` comment with 3 sub-tasks, each with file scope + contracts + dependencies.
4. (AC-4) Data wiring confirmed: constellation lighting reads `lesson_completion` (shared with on-course), `completion_events` for rank/streak/chronicle; consistent with the completion-sync fix.
5. (AC-5) This document rendered as `docs/system-architecture.html`.
6. `npm run build` + `npm test` green; WebGL-fallback renders the 2D layer on no-WebGL; reduced-motion shows a static lit state; no three on blog pages.
7. (AC-7) Visual review: the result reads as REAL, deep, immersive astronomy — NOT generic space, NOT clip-art circles, NOT "first-year." Chris signs off on the live site.

---

## 10. Risks

- **LOD glyph legibility** → the glyph must be the real bright-anchor figure (magnitude < 3.5), not a generic dot; keep ≤ ~8 glyphs so it reads as a clean star-map. Verify against the mockups.
- **Camera flight feel** → dolly-and-tilt is the "floating in space" bar; a bare lerp is a regression. Use maath damped easing + FOV breath; verify reduced-motion static mode.
- **Road/frontier determinism** → `frontierSlug` must be pure + unit-tested (first unstarted/in-progress with availability in road order); an empty sky returns null (no frontier).
- **Data divergence** → constellation lighting MUST read `getCompletedLessonSlugs` (lesson_completion), never `completion_events`, or the unmark bug returns. Both surfaces share the same loader.
- **Bundle on /profile** → lazy import verified; watch that a shared-layout refactor does not reintroduce a top-level three import (bundle-trace gate in integrate).
- **Creativity drift back to generic space** → the AC-7 visual sign-off gate is non-negotiable; the hard rejection floor ("reads as generic space") applies to every visual checkpoint.
