# System Architecture — Hubble Field

**Tenant:** adroit-blog · **Branch:** `feat/hubble-field` · **Date:** 2026-09-04
**Architect:** brainiac · **Phase 1:** diagnosis + lab architecture. No production rewrite in this phase.
**Visual floor:** `docs/hubble-field-north-star.md` · **Requirements:** `docs/requirements-hubble-field.md`
**Supersedes:** `docs/arch-deep-sky-galaxy.md`, `docs/arch-immersive-3d.md`, `docs/system-architecture.html`

The 3D layer is shipped and working. It is also wrong, and the reasons are structural rather than cosmetic — no amount of bloom tuning reaches them. This document says what broke, what survives, where the fix gets built (`/lab/hubble-field`), and how it ports back.

---

## 1. Diagnosis of the shipped 3D layer

### 1.1 It's a dashboard, not a sky

`FullSkySection` renders `SkyHeroChrome` — the rank `<h1>`, the rank description, and a four-card stat grid — and passes it as `children` into `ProfileGalaxy3D`, which drops it into `.cx3d-overlay` **on top of the canvas**. Add `SkyChart`, `JourneyRail`, `RankChip`, `Legend`, and the `Overview` button and the WebGL surface is a texture behind a control panel. The eye reads the cards; the sky is wallpaper.

### 1.2 Wrong star primitives

Three separate primitives, three separate failures:

- `IgnitedStar` draws soft radial gradient sprites. Radial gradient + `UnrealBloom` is the recipe for **bokeh** — out-of-focus lens balls, not stars.
- `ConstellationGlyph` draws mesh glyphs without a point texture, so at small scale they resolve as **squares**.
- Figure lines use `LineBasicMaterial` — uniform-width, fully opaque, aliasing-free **CAD strokes**. Real asterism figures are faint additive hints.

None of these can produce a magnitude distribution, because none of them are point shaders with per-star attributes.

### 1.3 Space is a wash

`nebula-gl` is a 2D noise shader on an inward-facing sphere: a flat blue-violet tint over the entire frame, identical from every angle, with no occlusion and no form. Behind it sit roughly 900 field stars — too few to read as depth, enough to read as scatter. And `CameraRig`'s `HOME` is `(0, 4.6, 9.5)`: elevated, tilted down, looking at the ring of course nodes from above. That is the camera position for a **diagram**, not an observation.

### 1.4 Not navigable

`ProfileGalaxy3D.handleSelectSector` calls `router.push('/learn/' + slug)` when no `onSelectSector` is supplied. The first click on the sky leaves the sky. The `Overview` button is inverted — it renders only when `focusSlug` is null, so it appears exactly when you are already in overview and disappears when you would need it. There is no orbit control at all: the camera is scripted, so the user cannot look around.

### 1.5 The data is thin

`asterism-data.ts` authors two asterisms — Orion (`salesforce-architect`) and Cassiopeia (`agentic-ai`). The other five courses fall back to generated geometry, so five of seven sectors are invented scatter wearing a course name. Rank illumination is computed (`rankIllumination`) and displayed in `RankChip` as a percentage — but it never modulates the actual field brightness. The headline mechanic is a number in a chip.

---

## 2. What stays

The bones are good. Keep them.

| Keep | Why |
|---|---|
| `lesson_completion` lighting + `completion_events` for rank/streak/chronicle | Correct source of truth, RLS-scoped, already shipped. No schema change. |
| `contracts-constellations.ts` | The contract is fine. Do not touch it. |
| `asterism-data.ts` (Orion, Cassiopeia) | Real coordinates, real spectral classes, real magnitudes. This is the seed of the whole visual language. |
| GPU starfield shader (`starfield-gl` + `star-material.glsl.ts`) | Already a single `Points` buffer with per-star attributes. This — not `IgnitedStar` — is the primitive the whole field should be built from. |
| Lazy dynamic canvas + WebGL gate | `ConstellationCanvas` behind `next/dynamic({ ssr: false })`, `supportsWebGL()` gate, `LoadingSky`. Bundle discipline holds. |
| `usePrefersReducedMotion` | Bound and working. Extend it to cover warp. |
| 2D fallback | Untouched, still the floor for no-WebGL. |
| LOD idea (one focused constellation) | The right compositional answer. It was implemented against the wrong primitives, not the wrong idea. |

---

## 3. Lab architecture — `/lab/hubble-field`

The lab page **is** the mockup. It exists so the field can be tuned against a real GPU instead of reviewed as a static poster.

```
src/app/lab/hubble-field/
└── page.tsx                Dev-facing route. No auth, no DB. noindex + excluded
                            from sitemap. Renders <HubbleFieldLab/> only.

src/components/Constellations/lab/
├── HubbleFieldLab.tsx      Client shell. Owns FieldParams state + mode
│                            ('framed' | 'observatory'), renders the control
│                            panel beside (never over) the canvas.
├── FieldControls.tsx        Live sliders: star count, magnitude falloff, spike
│                            threshold + intensity, exposure, dust density,
│                            rank illumination. Values readable and copyable.
├── field-fixtures.ts        PURE. Synthetic ProfileSky + 7 courses at assorted
│                            completion levels. No network, no auth.
├── deep-field-gl.tsx        The candidate field: ONE Points buffer, per-star
│                            magnitude / spectral temp / twinkle phase / spike
│                            weight. Replaces sprite stars.
├── spike-material.glsl.ts   Point fragment shader: hot sub-pixel core, steep
│                            falloff, diffraction spikes gated on magnitude.
├── dust-volume.tsx          Dust as structure — layered occluding billboards
│                            with form, not a tinted sphere.
└── WarpRig.tsx              Mode-driven camera: framed dolly ↔ observatory
                             orbit, with the warp transition between them.
```

**Rules the lab obeys:** it imports from `asterism-data.ts` and the existing pure model layer, it renders no production component, and it ships no DOM chrome over the canvas — the controls sit next to the field so the frame under review is the frame that ships.

**Exit criterion:** a screenshot from the lab passes the north-star one-question test. Until then, Phase 2 does not start.

---

## 4. Intended production port (Phase 2, not this phase)

Once the lab passes:

1. **Promote the field.** `deep-field-gl` + `spike-material.glsl.ts` + `dust-volume` move into `3d/` and become the star primitive for both `ProfileScene` and `SeriesScene`. `IgnitedStar` is retired to the interactive-hover case only, or deleted.
2. **Frame the section.** `FullSkySection` stops passing `SkyHeroChrome` as `children`. Rank title, stat cards, and chronicle become page siblings above and below a bounded galaxy frame. `.cx3d-overlay` loses its content.
3. **Add the mode.** A `GalaxyMode` state (`'framed' | 'observatory'`) lifts into `ProfileGalaxy3D`; `WarpRig` replaces `CameraRig`'s fixed `HOME`; `Esc` warps out.
4. **Break the eject.** `handleSelectSector` sets focus and never routes. An inspect panel owns the only `router.push`. The `Overview` button's condition is inverted back to correct (`focusSlug !== null`).
5. **Orbit.** `OrbitControls` (damped, polar-clamped, zoom-limited) mount in observatory mode only.
6. **Apply illumination.** `rankIllumination(rank)` becomes a shader uniform on the field, not a chip label.
7. **Author the missing five.** Real asterisms for the remaining courses, or an honest generated-field state that does not pretend to be a named constellation.

Nothing in `discovery/`, `contracts-constellations.ts`, or the 2D layer is touched by any of the above.

---

## 5. New ADRs

### ADR-309 — Warp is a mode, not a route
The galaxy has two states in one mounted canvas: `framed` (a bounded section of `/profile`) and `observatory` (fullscreen). The transition is a camera and layout animation, not a navigation and not a remount.
**Why:** a full-viewport galaxy page forces stats and chronicle onto the stars, which is exactly failure 1.1. A separate route would tear down the WebGL context, losing the continuity that makes the warp feel like travel.
**Consequences:** mode state lives in the public entry; camera targets and post-processing intensity are functions of mode; `Esc` and scroll restoration are the entry's responsibility; reduced motion collapses the transition to a cross-fade.

### ADR-310 — Stars are point shaders, never bokeh sprites
Every star in the field is a vertex in a single `Points` buffer with per-star attributes (magnitude, spectral temperature, twinkle phase, spike weight), rendered by a custom fragment shader with a hot sub-pixel core, steep falloff, and diffraction spikes gated on magnitude.
**Why:** soft radial sprites plus bloom produce out-of-focus lens balls (1.2). Only a point shader can express a steep magnitude distribution across thousands of stars in one draw call, and only per-star attributes prevent the clip-art uniformity that has been rejected twice.
**Consequences:** `IgnitedStar`'s sprite stack is demoted or deleted; spike geometry is shader work, not sprite art; bloom is tuned *down*, because brightness now comes from the field rather than the post chain.

### ADR-311 — Orbit is available in fullscreen only
Damped `OrbitControls` with clamped polar angle and zoom range mount in observatory mode. Framed mode stays on a scripted, non-interactive camera.
**Why:** an interactive camera inside a scrolling page steals wheel events and traps the reader; an observatory with no camera control is a diagram you are forbidden to look around (1.4). Mode boundaries resolve the conflict cleanly.
**Consequences:** framed mode never captures pointer or wheel gestures; observatory mode does; clamps prevent the user from finding the empty regions of the scene; reduced motion disables inertia and keeps orbit direct.

### ADR-312 — Rank illumination modulates the field, not a label
`rankIllumination(rank)` feeds a shader uniform that scales field-star brightness, dust luminance, and the count of stars above the visibility floor. The rank chip may still display the number, but the number is a readout of something visible.
**Why:** the product promise is "your sky gets brighter as you learn." Shipping that as a percentage in a chip while the field stays constant is the promise unfulfilled (1.5).
**Consequences:** illumination is a single uniform in the field material; the lab exposes it as a slider so all five rank bands are reviewable side by side; low ranks must still read as a legible sky, so the floor is a design decision, not zero.
