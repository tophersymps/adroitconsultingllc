# Requirements: Hubble Field

> **Tenant:** adroit-blog · **Branch:** `feat/hubble-field` · **Date:** 2026-09-04
> **Author:** Lois Lane (BA)
> **Visual floor:** `docs/hubble-field-north-star.md` — any story that ships and fails the floor is not done
> **Architecture:** `docs/arch-hubble-field.md`
> **Supersedes:** `docs/requirements-immersive-3d-constellations.md`

---

## Summary

The 3D constellation layer shipped, and it reads as a dashboard with a starfield behind it. Hubble Field fixes the two structural mistakes — the galaxy owns a whole viewport it hasn't earned, and the first click throws you out of it — and replaces the star rendering with a deep-field language. Phase 1 is documentation plus a WebGL lab page. The lab is the mockup; nothing in production is rewritten until the lab passes the floor.

**Out of scope:** the B-18 data architecture, `contracts-constellations.ts`, the 2D constellation components, and the `/learn/[series]` course tracker.

---

## User Stories

### US-HF-01 — The galaxy is a framed section, not a page

**As a** learner on `/profile`,
**I want** my sky to live in a bounded section of the page,
**so that** I can read my rank, streak, and chronicle without stars behind the text.

**Acceptance Criteria**
- Given I load `/profile`, when the page renders, then the galaxy occupies a framed section with visible bounds and the page scrolls normally around it.
- Given the galaxy section is on screen, when I look at the rank title, stat cards, and chronicle, then they are rendered as page content **outside** the canvas — no DOM chrome is overlaid on the WebGL surface.
- Given I scroll past the section, when the canvas leaves the viewport, then the render loop pauses and the page remains responsive.
- Given the section is framed, when I inspect it, then it does **not** occupy 100vh and does not suppress page scroll.

### US-HF-02 — Warp into the observatory

**As a** learner who wants to explore my sky,
**I want** one deliberate action to expand the section into a fullscreen observatory,
**so that** immersion is something I chose rather than something imposed on the page.

**Acceptance Criteria**
- Given the framed section, when I activate the enter-observatory affordance, then the canvas expands to fullscreen through a warp transition and the mode becomes `observatory`.
- Given I am in the observatory, when I press `Esc` or activate warp-out, then the canvas returns to the framed section and the page restores my prior scroll position.
- Given the warp transition, when it plays, then it is a continuous camera and framing move — the canvas is never torn down and remounted, and no route change occurs.
- Given `prefers-reduced-motion: reduce`, when I warp in or out, then the mode changes instantly with a cross-fade and no camera flight.
- Given I am in the observatory, when I use keyboard navigation, then focus is trapped in the observatory and the affordance that opened it is refocused on exit.

### US-HF-03 — Inspect, then choose to leave

**As a** learner clicking around my sky,
**I want** a click to reveal what I clicked without navigating,
**so that** I can browse my whole record in one place instead of being ejected on the first touch.

**Acceptance Criteria**
- Given the observatory, when I click a constellation, then the camera approaches it, its member stars resolve to full fidelity, and no route change occurs.
- Given a constellation is approached, when I click one of its stars, then an inspect panel names the lesson and its state, and no route change occurs.
- Given the inspect panel is open, when I activate its explicit CTA, then `/learn/...` opens — and that is the **only** path out of the field.
- Given I have approached a constellation, when I press `Esc` or activate back-to-field, then I return to the full field view (and a second `Esc` warps out to the profile section).
- Given any star, course node, or road segment, when I click it, then `router.push` is **not** called as a direct result of that click.

### US-HF-04 — Stars look like a deep-field photograph

**As a** learner looking at my sky,
**I want** it to read as a real telescope image,
**so that** it feels like an observation of something rather than a tutorial demo.

**Acceptance Criteria**
- Given the field renders, when stars are drawn, then they are point-shader primitives with per-star attributes (magnitude, spectral temperature, twinkle phase) — not soft radial sprites, not glyph meshes.
- Given the field renders, when I compare stars, then apparent size and brightness follow a steep magnitude distribution: the majority are faint pinpricks and only a small minority are prominent.
- Given star color, when it is computed, then it derives from spectral class across the OBAFGKM range; red appears only on a named, astronomically real red giant, and never as a general state color.
- Given diffraction spikes, when they render, then they appear only on the brightest few percent of stars, and their intensity scales with magnitude.
- Given the background, when dust renders, then it reads as structure with form and occlusion — not a uniform tinted fog sphere over the whole scene.
- Given asterism figure lines, when they render, then they are faint additive strokes that recede behind the stars — not crisp uniform-width vector rails.
- Given a screenshot of any frame, when it is shown to a fresh reviewer, then they describe it as a telescope image, not a game map or a bloom demo. **This gate is human and non-negotiable.**

### US-HF-05 — The lab page is the mockup

**As** the team building this,
**I want** a real WebGL page at `/lab/hubble-field`,
**so that** we iterate on the actual renderer instead of arguing over static posters.

**Acceptance Criteria**
- Given I visit `/lab/hubble-field` in development, when it loads, then a full WebGL field renders from fixture data with no authentication and no database dependency.
- Given the lab page, when I use its controls, then I can tune the field parameters (star count, magnitude falloff, spike threshold, exposure, dust density) live and read the current values.
- Given the lab page, when I switch modes, then I can toggle between framed and observatory to review the warp transition in isolation.
- Given the lab page, when it is built for production, then it is excluded from the sitemap, marked `noindex`, and pulls no `three` code into any other route's bundle.
- Given a visual review, when it happens, then it happens against the lab page — **no `mockup-*.html` starfield posters are produced for this feature.**

### US-HF-06 — The 2D fallback does not change

**As a** learner without WebGL, on a slow device, or with reduced motion,
**I want** the surface I already had,
**so that** the visual reboot costs me nothing.

**Acceptance Criteria**
- Given WebGL is unavailable, when I load `/profile`, then the existing 2D constellation fallback renders exactly as it does today, with no visual or DOM change.
- Given `prefers-reduced-motion: reduce`, when the field renders, then the sky is static and legible: no ignition sequence, no drift, no camera flight, no grain.
- Given the reboot lands, when the 2D components and their tests are reviewed, then they are untouched — the changes are additive to the 3D layer only.
- Given a screen reader, when it reaches the galaxy section, then the section exposes a text equivalent of course progress and does not announce the canvas as interactive content.

---

## Non-functional requirements

| # | Requirement |
|---|---|
| NFR-1 | `three` / r3f stay behind a lazy dynamic import. Blog, home, hub, tags, and search bundles remain three-free; the lab route does not leak into them. |
| NFR-2 | DPR capped at 2. Framed mode renders at reduced cost and pauses off-screen; observatory mode gets the full budget. |
| NFR-3 | LOD holds: exactly one constellation at full fidelity, the rest as bright-anchor nodes. |
| NFR-4 | Touch hit targets for interactive stars ≥ 44px. |
| NFR-5 | `npm run build` and the full test suite stay green; no schema change and no edit to `contracts-constellations.ts`. |

## Definition of done for Phase 1

1. North star, requirements, and architecture docs exist with HTML twins.
2. `/lab/hubble-field` renders a field that passes the US-HF-04 human gate.
3. Superseded docs carry supersession banners and are otherwise unmodified.
4. Production `ProfileGalaxy3D` / `SeriesScene` are unchanged — the port is Phase 2.
