# deep-sky - Profile Galaxy Reboot: Component & State Spec ("Sky Roads")

**Task:** t_ea789325 (design) · **Author:** kara · **Date:** 2026-09-02
**Consumes:** `contracts-constellations.ts` (ProfileSky, ConstellationState, RankId, RankBand, LadderProgress, AchievementStats). No renames.
**Engine:** Three.js via r3f + drei + @react-three/postprocessing (UnrealBloom). Custom GLSL for starfield/nebula/road.
**Downstream:** t_2156deb1 (arch) turns this into `src/shared/contracts.ts`; steel builds.

---

## 1. Component decomposition

### 1.1 Pure model layer (SSR-safe, unit-tested) - `galaxy-model.ts` (extended)
Stays deterministic, no three imports. New exports:

- `GalaxySector` (existing) - add `glyph: GlyphStar[]` (the bright-anchor subset, magnitude < 3.5, that forms the recognizable figure at distance) and `focus: boolean`.
- `GlyphStar` - `{ name, position, spectralClass, magnitude, isRedGiantAccent?, isNebula? }` (subset of the real asterism's bright anchors).
- `SkyRoad` - `{ nodes: string[] (seriesSlugs in journey order), traveled: string[] (behind you), untraveled: string[], curve: [number,number,number][] (Catmull-Rom through node positions) }`.
- `frontierSlug(sectors, road)` → the next recommended sector (first unstarted/in-progress with availability, in road order). Pure.
- `buildGalaxyModel` - returns `{ sectors, articles, road, frontierSlug }`.
- `sectorState` (existing) - unchanged (certified/completed/in-progress/unstarted).

### 1.2 Scene layer - `ProfileScene.tsx` (rewritten)
- **Focused constellation** (the `focus` sector): renders at full deep-sky fidelity - all member stars via `IgnitedStar`, real spectral colors, per-star lit state, M42 nebula anchor, figure lines. This is the Command/Inspect surface.
- **Glyph nodes** (every other sector): `ConstellationGlyph` - the bright-anchor asterism at `--glyph-scale`, same star+spike language, status halo + progress arc + name label. Clickable.
- **SkyRoad** - the additive route line through node positions, traveled segment warm gold, untraveled faint cool dashed.
- **WaypointReticle** - the pulsing cyan ring + "NEXT · [course]" tag on the frontier node.
- **CameraRig** - dolly-and-tilt flight controller (see §3).

### 1.3 HUD layer (2D DOM overlays)
- **SkyChart** (replaces `SectorMinimap`): mini sky-road map - node dots on the route, traveled/untraveled road, "you are here" pulse, next-waypoint marker, view cone. Click a dot → fly.
- **ConstellationCard** (replaces `StarTooltip`): contextual info card - constellation name, course, state chip, lit/total, "Continue / Next star" CTA. Edge-anchored.
- **JourneyRail**: horizontal waypoint strip of course names in road order, state-coded, frontier highlighted, prev/next arrows.
- **RankChip**: "EXPLORER · 55% lit" (Monitor aggregate).
- **Legend** (collapsible): the state key.

### 1.4 Entry - `ProfileGalaxy3D.tsx` (unchanged entry)
Hosts scene + HUD, gates on WebGL, falls back to `fallback2D`. Wires `onSelectSector` → fly + navigate.

---

## 2. State matrix (all components)

| State | Focused constellation | Glyph node | Road segment | SkyChart dot | JourneyRail chip |
|---|---|---|---|---|---|
| **certified** | white-hot flare, highest bloom | white-hot halo + diamond badge | traveled (warm gold) | white-hot | white-hot + ✓ |
| **completed** | warm gold bloom | warm gold figure, steady halo | traveled (warm gold) | warm gold | warm gold |
| **in-progress** | cyan pulse on current star | partial figure + cyan pulse + progress arc | traveled (warm gold) | cyan | cyan |
| **unstarted** | (not focused) | faint cool pinprick figure, dim halo | untraveled (faint cool) | faint cool | faint cool |
| **next waypoint** | - | cyan reticle ring + pulse + "NEXT" tag | segment to it pulses | cyan ring | highlighted + "NEXT" |
| **loading** | static unlit + shimmer | static unlit | hidden | hidden | hidden |
| **empty** | starfield, 0 lit, editorial copy | - | - | - | - |
| **error** | renders unlit + inline retry | - | - | - | - |
| **no-webgl** | fall back to 2D `FullSkySection` | - | - | - | - |

**Responsive:** desktop = full 3D canvas. ≤768px = compact (fewer glyphs visible, camera pulled back, focused constellation fills `--focus-fill-mobile`), JourneyRail becomes the primary nav (thumb-reachable), SkyChart collapses to a small toggle. Interactive hit targets ≥44px on touch.

---

## 3. Camera flight spec (CameraRig)

- **Overview:** camera at sky-chart altitude, slow Keplerian drift (`--overview-drift-ms`) + pointer parallax, `--overview-tilt` so you feel inside the volume. Sees the whole atlas.
- **Fly to node (dolly-and-tilt):** 3-phase - (1) pull back slightly, (2) arc toward target along a curved approach (damped easing, maath), banking/tilting so the figure frames correctly, (3) decelerate + subtle FOV breath (`--fly-fov-breath`) on settle. Near field-stars parallax past = sense of travel.
- **Return to overview:** reverse pull-out.
- **Reduced motion:** static settled overview; selecting swaps focus (no flight). `usePrefersReducedMotion` → `staticMode`.

**Framing:** focused constellation fills `--focus-fill` (0.60) of viewport height, figure oriented correctly (Orion belt diagonal, Cassiopeia W upright).

---

## 4. Accessibility (WCAG AA)

- Every glyph node + SkyChart dot + JourneyRail chip is a real `<button>` with `aria-label` (e.g. "Fly to Orion - Salesforce System Architect Primer, 12 of 29 lit").
- Arrow keys move focus along the road (prev/next waypoint); Enter flies; Escape returns to overview.
- Focus ring `--focus-ring` on all interactive elements.
- `prefers-reduced-motion` zeroes flight/parallax/pulse/shimmer.
- Contrast: HUD ink `#EAF2FF` on `rgba(6,15,31,0.72)` ≥ 7:1; state colors chosen for luminance separation (warm gold vs cyan vs faint cool vs white-hot), not hue-only.

---

## 5. Handoff to arch (t_2156deb1)

- **New contracts to encode in `src/shared/contracts.ts`:** `GlyphStar`, `SkyRoad`, `frontierSlug` signature, `GalaxySector.glyph`/`focus`, `SkyChartProps`, `ConstellationCardProps`, `JourneyRailProps`, `CameraRigProps`.
- **Pure-model rule:** `galaxy-model.ts` stays SSR-safe + unit-tested (road, frontier, glyph are deterministic).
- **Data wiring:** profile galaxy sources from `completion_events` (single source of truth); the on-course completion-sync fix keeps both surfaces consistent.
- **Build split (suggested):** (1) pure model + contracts, (2) scene LOD + road + waypoint + camera, (3) HUD (SkyChart/Card/Rail) + a11y + responsive.
