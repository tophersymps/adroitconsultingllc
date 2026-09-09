# deep-sky - Profile Galaxy Reboot: "Sky Roads" (Direction Brief)

> **SUPERSEDED (2026-09-04):** Visual direction for the constellation 3D layer is now **Hubble Field** (Rev 3). See `docs/hubble-field-north-star.md`, `docs/requirements-hubble-field.md`, and `docs/arch-hubble-field.md`. This document is retained as historical record of the Sky Roads direction. Do not implement from this file.

**Task:** t_ea789325 (design) · **Author:** kara (designer) · **Date:** 2026-09-02
**Release:** `deep-sky` v1.2.0 · **Tenant:** adroit-blog · **Surface:** `/profile` "Your Sky"
**Engine (LOCKED):** Three.js via react-three-fiber + drei + @react-three/postprocessing (UnrealBloom). Custom GLSL/GPU-first where it matters.
**Downstream:** t_2156deb1 (arch, brainiac) reads this first, then steel builds. This brief is the source of truth for the fresh concept tokens.

---

## 0. Why the current galaxy is rejected (the problem this reboot fixes)

The shipped `ProfileScene`/`ProfileGalaxy3D` renders **every course's constellation at full fidelity simultaneously** - up to 29 member stars per course × ~7 courses, all visible at once, each with its own figure lines, scattered across a ring. The result is the exact failure Chris named: **a dense, non-navigable jumble of dots with no clear click affordance.** You cannot tell which cluster is a destination, which is next, or how to get there. The camera is a bare position lerp, so flying feels like a cut, not travel.

The fix is not "more stars, prettier bloom." It is a **compositional reboot**: stop showing everything at once, and give the sky a **guided-map structure** like a video-game world map.

---

## 1. Surface Archetype (committed before tokens)

> **This is an Explore surface (primary) with a Monitor aggregate.** The learner is *browsing an open, navigable sky* and *watching their progress accrue as a lit journey*. The "hero" is the navigable 3D galaxy itself - never a marketing hero, never three feature cards.

| Surface | Archetype | Why |
|---|---|---|
| Profile galaxy overview | **Explore** (primary) | Browsing an open space of constellation sectors; camera flies between them. |
| Focused constellation (approach) | **Command/Inspect** (secondary) | Drilling into one constellation's member stars; speed and focus. |
| Rank → galaxy illumination | **Monitor** (aggregate) | How much of the sky is lit = rank. |

**Rule for arch + steel:** do NOT give the profile galaxy a centered hero + three feature cards. It is a data sky. The composition is a navigable atlas.

---

## 2. One-Line Direction

> **"Your learning is a sky you light up - and the sky is a map. Every course is a real constellation you can fly to; a faint road threads them in the order you should travel; the next constellation ahead glows as your waypoint. You are an observer inside the sky, and the sky shows you where to go."**

The conceptual anchor is **the guided celestial atlas** - the video-game world-map / realm-gate feel Chris asked for, grounded in the real deep-sky base. The learner is not in front of a poster; they float inside a navigable sky where every constellation is a **place** you can see, reach, and light up.

---

## 3. The Core Reboot: Level-of-Detail (LOD) - one constellation at a time

The single highest-leverage change. **Never render all constellations at full fidelity at once.** Instead:

- **Focused constellation (the one you're at / selected):** renders at full deep-sky fidelity - all its real member stars legible, named on hover, per-star lit state, M42-style nebula anchor. This is where you read per-lesson progress and click a lesson star.
- **Every other course = a "constellation glyph":** a compact node holding ONLY that constellation's recognizable bright-anchor asterism (Orion's hourglass, Cassiopeia's W, or the course's small deterministic star ring), drawn at reduced scale with the same star + diffraction-spike language. Far enough away + few enough nodes (≤ ~8) that it reads as a clean star-map, not a scatter.

**Why this kills the jumble:** the eye is never asked to parse hundreds of simultaneous stars. At any moment there is exactly ONE rich constellation and a handful of legible glyphs. This is how a game map stays readable - you see the destinations, not every tree.

**LOD rule:** a glyph's recognizable figure = the bright anchors (magnitude < 3.5, the same set `projectAsterism` already uses to frame the figure). Fainter members only materialize when you approach. This is astronomically honest (the bright anchors ARE what make Orion recognizable) and it is the anti-clip-art bar.

---

## 4. The Guided Path: "Sky Roads" + the Frontier Waypoint

This is the video-game guided-map feel. Between the constellation nodes runs a **faint arcing road** (a thin additive route line) threading the sectors in **recommended learning order** (the course dependency flow / authored journey order, falling back to the existing ring order).

- **Traveled road** (behind you, completed/certified sectors) = **warm golden**, steady.
- **Untraveled road** (ahead, unstarted sectors) = **faint cool**, dim.
- **The Frontier Waypoint** = the next recommended sector (first unstarted/in-progress with availability). It carries a **pulsing cyan reticle ring** + a floating **"NEXT · [course]"** tag, and is the **default camera focus on load**. This is the clear click affordance and the "what to do next" answer.

The learner always sees: where they are (the focused node), where each constellation is (glyphs on the road), how to get there (follow the road / click a glyph), and what's next (the pulsing waypoint).

**Layout:** sectors sit at authored world positions along the road (a gentle arc/spiral so the journey has a start and a frontier), not an equal-angular ring. Fall back to the existing `sectorPosition` ring when no authored path exists. The road is a Catmull-Rom curve through the node positions.

---

## 5. Achievement States - unmistakable at node scale

Reuse the deep-sky state ladder, but make it read at the **node/glyph** scale AND the **per-star** scale. Every node carries a thin **progress arc** (lit/total) so "how to achieve it" is legible at a glance even before you fly there.

| State | Node / glyph visual | Per-star (focused) visual |
|---|---|---|
| **certified** | White-hot halo + small diamond/spark badge; road behind fully lit | White-hot flare, highest bloom |
| **completed** | Warm golden figure fully lit, steady bright halo | Warm golden bloom (G-class) |
| **in-progress** | Figure partially lit (progress arc shows lit/total) + a cyan current-star pulse inside | Cyan pulse on the current lesson star |
| **unstarted** | Faint cool pinprick figure, dim halo, clearly "ahead" | Faint cool pinprick, no bloom |
| **next waypoint** | Cyan reticle ring + pulse + "NEXT" tag | - |

**Color language (unchanged from deep-sky base):** warm golden = lit, cyan = current, white-hot = complete/certified, faint cool = unstarted. Red stays reserved for Kryptonian brand chrome + Betelgeuse's astronomically-real orange-red accent. No invented rainbow.

---

## 6. Camera as a Character (flight spec - not a bare lerp)

The current camera is a position lerp + `lookAt(0,0,0)`. The reboot makes flight feel like travel:

- **Overview (resting):** camera floats at "sky-chart altitude" - slow Keplerian drift + pointer parallax, seeing the whole atlas (all glyphs + road) with the focused node centered-ish. Slightly tilted/dollied so you feel you're in the volume, not over a poster.
- **Fly to a node:** a scripted **dolly-and-tilt**: camera pulls back slightly, arcs toward the target along a curved approach, banks/tilts so the constellation figure frames correctly, decelerates (damped easing, maath), subtle FOV breath, near field-stars parallax past (sense of travel). Settles at the "inside the constellation" framing distance.
- **Return to overview:** reverse pull-out.
- **Reduced motion:** static settled overview; selecting swaps which node is focused (no flight). `usePrefersReducedMotion` drives `staticMode`.

**Framing:** the focused constellation fills ~55-65% of the viewport height, figure oriented correctly (Orion's belt diagonal, Cassiopeia's W upright). This is the "legible" bar - you can actually SEE the constellation and its progress.

---

## 7. HUD / Chrome (the guided controls)

- **Constellation info card** (contextual, edge-anchored, not center): when focused/inspecting a node, shows constellation name (e.g. "Orion · The Hunter"), which course, state chip, lit/total, and a "Continue / Next star" CTA. Replaces the floating tooltip-only affordance.
- **Chart minimap** (bottom-right, upgraded from tiny dots): a mini "sky road" map - node glyph dots on the route + traveled/untraveled road + a "you are here" pulse + next-waypoint marker + view cone. Click a dot → fly. This replaces the ambiguous tiny minimap.
- **Journey rail** (top or bottom): horizontal waypoint strip of course names in road order, showing state; the frontier highlighted; arrow to traverse. Also shows rank/illumination.
- **Legend** (collapsible): the state key (unstarted / in-progress / completed / certified / next).
- **Rank + illumination** chip (top-left): "EXPLORER · 55% lit" - the Monitor aggregate.

Keep chrome minimal and edge-anchored so the sky stays the hero. The existing rank ladder + stats + chronicle remain as page-level overlay panels beside the 3D galaxy (out of the galaxy scene's own HUD).

---

## 8. Real Astronomy (unchanged, the substance)

- Constellations are real asterisms (Orion, Cassiopeia) with real member stars, real spectral colors, real magnitudes, real figure connections. No invented scatter.
- The glyph's recognizable figure = the real bright anchors.
- M42 (Orion Nebula) remains the completion anchor for the Salesforce course.
- Lesson count = member-star count used; overflow maps to progressively fainter real members (already in `asterism-data.ts`).

---

## 9. Design tokens (additive on the deep-sky base)

Full draft in `design-tokens-sky-roads.css`. Additive on the shipped deep-sky tokens + the 2D constellation tokens. Every token ships an `html.dark` remap. New tokens introduced by this concept:

- **Road / path:** `--road-traveled` (warm gold), `--road-untraveled` (faint cool), `--road-width`, `--road-opacity`.
- **Waypoint:** `--waypoint-ring` (cyan), `--waypoint-pulse`, `--waypoint-tag-bg`.
- **Node states:** `--node-certified`, `--node-completed`, `--node-inprogress`, `--node-unstarted`, `--node-halo-*` per state.
- **Progress arc:** `--arc-track`, `--arc-fill` (warm gold), `--arc-fill-current` (cyan).
- **LOD:** `--glyph-scale`, `--glyph-star-size`, `--focus-fill` (fraction of viewport the focused constellation occupies).
- **Camera:** `--fly-dolly-ms`, `--fly-arc-ms`, `--fly-fov-breath`, `--overview-drift`.
- **Chrome:** `--hud-card-bg`, `--hud-card-border`, `--hud-chip-bg`, `--minimap-bg`.

---

## 10. Component / state spec

Full spec in `component-spec-sky-roads.md`. Summary of new/changed components (all map to existing contracts, no renames):

- `ProfileGalaxy3D` - hosts the scene + HUD (unchanged entry).
- `ProfileScene` - **rewritten** to the LOD model: one focused constellation at full fidelity + glyph nodes + road + waypoint.
- `galaxy-model.ts` - **extended** (pure, SSR-safe, unit-tested): add `road` (ordered node path + traveled/untraveled segments), `frontierSlug` (next waypoint), `glyph` (bright-anchor subset per sector), `focus` (which node is focused). Deterministic.
- `SectorMinimap` → **`SkyChart`** - upgraded to show road + traveled/untraveled + you-are-here + next-waypoint + view cone.
- `StarTooltip` → **`ConstellationCard`** - contextual info card (name, course, state, lit/total, CTA).
- New: `SkyRoad` (the route line), `WaypointReticle` (the pulsing next marker), `ConstellationGlyph` (LOD node), `JourneyRail` (waypoint strip), `CameraRig` (dolly-and-tilt flight controller).

---

## 11. Anti-Slop Self-Audit (this direction)

- **1 Tech gradient:** NONE. The sky is the deep-navy Fortress base; stars are real spectral colors. Pass.
- **2 Generic tech hue:** NO. Accent is the real stellar temperature arc + Fortress ice, not indigo. Pass.
- **3 Feature-tile grid:** NO. Explore/Monitor data surfaces, no icon+heading+sentence×3. Pass.
- **4 Accent rail:** NO. The road is a real navigation path, not a decorative left strip. Pass.
- **5 Unearned blur:** NO glassmorphism on core surfaces; the sky is a deliberate 3D canvas. Pass.
- **6 Monument stat:** rank/illumination shown once as a chip, not filling space. Pass.
- **7 Icon topper:** NO. The star IS the data. Pass.
- **8 Center stack:** NO. The only centered moment is the focused constellation (Command/Inspect), which is earned. Pass.
- **9 Default type:** Inter kept (existing brand); mono kickers chosen. Pass.
- **10 Wrong surface:** NO. Explore navigation on the galaxy, Monitor aggregate, Command/Inspect on focus. Pass.

**Slop score: 0/10.**

---

## 12. Wow-Factor Bar (this direction)

1. **Real imagery** - 2 verified FAL mood boards (sky-roads overview + inside-Orion) embedded; the 3D scene is the imagery. Pass.
2. **Motion** - dolly-and-tilt camera flight, waypoint pulse, road reveal, ignition, parallax, reduced-motion respected. Pass.
3. **Depth** - Keplerian parallax, volumetric dust, depth fog, layered LOD. Pass.
4. **Typographic scale** - oversized sky display + mono kicker contrast (kept from 2D). Pass.
5. **Craft details** - consistent star/space/radius system, a11y labels, states on everything. Pass.
6. **Signature element** - the **Sky Road** (guided path with traveled/untraveled segments + pulsing frontier waypoint) + the **LOD glyph atlas** (one constellation at a time). Pass.

**Bar: 6/6** for the direction. Every final mockup must hold ≥4/6.

---

## 13. Handoff to arch (t_2156deb1) + steel

- **Files this brief points at:** `direction-brief-sky-roads.md` (this), `design-tokens-sky-roads.css`, `component-spec-sky-roads.md`, `moodboards/*.png` (2 FAL images), `mockups/*.html` (desktop overview, desktop approach, mobile), `reports/design-system.html`.
- **Contract alignment:** every component name/type maps to `contracts-constellations.ts`. Do not rename. Use `RankBand`/`Rank`/`LadderProgress` for the ladder. The 3D components are NEW/rewritten (`ProfileScene`, `SkyChart`, `ConstellationCard`, `SkyRoad`, `WaypointReticle`, `ConstellationGlyph`, `JourneyRail`, `CameraRig`) and consume the same props as the components they replace.
- **Engine:** Three.js via react-three-fiber + drei + @react-three/postprocessing (UnrealBloom). Custom GLSL for the starfield + nebula + road.
- **Real-asterism data:** author from a canonical source (IAU / Bayer). Do not hand-invent positions.
- **Rejection floor:** if the build reads as generic space, clip-art circles, or a first-year demo, it is rejected. The AC-6 wow bar (≥4/6) is non-negotiable.
- **Deliverables expected from steel:** the working navigable profile galaxy (LOD + Sky Road + waypoint + dolly-and-tilt camera + SkyChart), then integrate + verify.
