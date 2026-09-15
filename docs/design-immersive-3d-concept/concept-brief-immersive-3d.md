# Immersive 3D Constellations: Concept Brief (CLEAN SLATE, REV 2)

**Task:** t_66ab1383 (concept sprint) · **Author:** kara (designer) · **Date:** 2026-09-02
**Tenant:** adroit-blog · **Upgrade of:** B-18/B-19 Constellations + Chronicle (shipped)
**Engine (LOCKED):** Three.js via react-three-fiber + drei + @react-three/postprocessing (UnrealBloom). D3 is NOT in the main path.
**Status:** CONCEPT ONLY. Input/reference for the Web Dev team, who own the final visual language and build. No production code here.
**Governing spec:** docs/immersive-3d-constellations-plan.md (REV 2) + docs/requirements-immersive-3d-constellations.md

This is a clean-slate creative reboot. The prior design direction (Rev 1) was rejected by Chris as generic space / "first-year stuff." This brief does NOT iterate on those docs. It rebuilds the visual language from scratch on a real-astronomy grounding, with a hard rejection floor: if the direction reads as generic space, clip-art circles, or a first-year demo, it is rejected.

---

## 1. Surface Archetype (committed before tokens)

> **This is a Monitor surface with an Explore navigation layer.** The learner is *watching their learning progress accrue as a living sky*; the "hero" is the 3D celestial field itself, not copy. The profile galaxy adds a navigable journey (Explore) on top of the Monitor aggregate.

| Surface | Archetype | Why |
|---|---|---|
| On-course tracker (Learn course page) | **Monitor** (primary) | Watching course progress accrue as lit stars in real 3D. Density + glanceability. |
| Ignition sequence (on load) | **Decide/Learn moment** | The one earned wow beat: lit stars surge on one-by-one in lesson order. |
| Raycast hover + click-to-fly | **Command/Inspect** (secondary) | Drilling into one star/lesson. Speed and focus. |
| Profile galaxy | **Explore** (primary) + **Monitor** (aggregate) | Browsing an open space of constellation sectors; camera flies between them. |
| Rank ladder to galaxy illumination | **Monitor** (aggregate) | How much of the galaxy is lit = rank. |

**Rule for the Web Dev team:** do NOT give the profile galaxy a marketing hero + three feature cards. It is a data sky. The "hero" is the navigable 3D galaxy.

---

## 2. One-Line Direction

> **"You are an observer of a real, deep sky. Every lesson you complete re-lights a star of a real constellation: a faint pinprick blooms into a burning sun. Your learning record is a sky you bring back to life, asterism by asterism, from a single faint constellation to a fully-illuminated galaxy."**

The conceptual anchor is **real stellar ignition**: a cold, dim body igniting into a luminous star (protostar to main sequence to white-hot finish). The learner re-lights real asterisms in the real order of their stars. This is not a metaphor bolted onto a starfield; it is the actual physics of the night sky, and the design language is built around it.

---

## 3. The Real Astronomy (the substance that kills "generic space")

Generic space fails because there is nothing real behind it: a starfield, a glow, a bloom, and nothing else. This concept is anchored in real astronomical structure at every level. The Web Dev team must author real-asterism data from a canonical source (IAU constellation charts / Bayer designations), never hand-invent positions.

### 3.1 Orion is a real hunter, not a chart

The Salesforce Architect course maps to **Orion**, the most recognizable constellation in the sky, visible from both hemispheres. It is drawn as it actually appears, not as an invented scatter:

- **The Belt** (Alnitak, Alnilam, Mintaka): three bright stars in a near-perfect diagonal line. This is the spine of the course, the three core lessons.
- **Betelgeuse** (upper-left shoulder): a genuine **red supergiant**, one of the largest stars known. It carries a real **orange-red cast** (ADR-303 exception, astronomically justified). It is the "oldest" star in the figure, a lesson that has been burning longest.
- **Rigel** (lower-right foot): a **blue-white supergiant**, the brightest star in Orion. It is the "youngest" and hottest, a lesson that burns white-hot.
- **M42, the Orion Nebula** (in the sword, below the belt): a **stellar nursery** where stars are actually being born. This is the **ignition/completion anchor**: the learner's journey ends where stars are born, completing the cycle. When the course is complete, the sword's nebula glows as the reward.

The hunter figure is the lesson map. The belt is the core, the shoulders and feet are the advanced lessons, the sword is the completion. Clicking a star opens its lesson.

### 3.2 Cassiopeia is a real W

The Agentic AI course maps to **Cassiopeia**, the real W-shaped asterism. Its five bright stars (Segin, Ruchbah, Gamma Cassiopeiae, Schedar, Caph) form the W. Authored with real coordinates, spectral class, and magnitude.

### 3.3 The spectral arc is the color language

Real stars are colored by their surface temperature, ordered by the **OBAFGKM** spectral sequence (hottest to coolest). This is the physical basis of the entire color language. The learner's progress follows this arc:

| Spectral class | Real color | Temperature | Role in the concept |
|---|---|---|---|
| O | Blue | ~30,000 K | Hottest, rarest, most massive |
| B | Blue-white | ~10,000-30,000 K | Rigel's class |
| A | White | ~7,500-10,000 K | Current-lesson star (cool blue-white) |
| F | Yellow-white | ~6,000-7,500 K | Transition |
| G | Yellow (Sun-like) | ~5,200-6,000 K | **Ignited / fusion moment** (the core reward) |
| K | Orange | ~3,700-5,200 K | Warm |
| M | Red | ~2,400-3,700 K | Coolest; Betelgeuse's class (the exception) |

The finish of the arc is **warm luminous** (white-gold / yellow-white / warm), never alert-red. Red is NOT a general star color; it reads as alert and stays reserved for Kryptonian brand chrome (nav pill, certificate finish-line). The sole exception is Betelgeuse, whose orange-red tint is astronomically real.

---

## 4. The Stellar State Ladder (the core decision)

Instead of an invented "cyan to gold to red" ladder, states map to a physically-real stellar-evolution arc, tuned so the finish is warm luminous:

| State | Real astrophysical moment | Visual | Bloom |
|---|---|---|---|
| **Unlit** (available, unborn) | Protostar / cold dim field star | A faint, desaturated cool point. Present but not yet burning. | **0** (no bloom) |
| **Current** (you are here) | A/B-class blue-white point | Cool blue-white point with a soft pulsing halo. Reads as "the star you are studying now." | **Low** (pulsing) |
| **Ignited** (fusion moment) | G-class, Sun-like main sequence | Warm yellow-white bloom. The core reward color: warm, bright, alive. | **Medium** |
| **Complete** (finished) | White-hot / warm white finish | The brightest, most luminous state. Highest bloom. **NOT red.** | **Highest** |
| **Betelgeuse accent** (accuracy) | Red supergiant | A completed asterism's true giant members may show their authentic orange-red tint. | Accuracy accent only |
| **Connecting rail** | The real asterism's connecting figure | Thin additive line tracing the real figure between lit/current stars. | Additive |

Per-star color temperature, magnitude, and size derive from each star's **real spectral class and apparent magnitude**. Vary every star: never identical. Uniform stars read as emoji/clip-art.

---

## 5. Stars Are Layered Light, Not Drawn Strokes

A lit star is a **glowing round point of light**: a white-hot center over a tinted core over a soft bloom, with only the faintest trace of diffraction. Do NOT draw stars as thin vector lines or crosses (that reads as "just lines"). Layered additive glow sprites are the fix.

At full-advantage scale, per-star variance is computed in the shader, not per-star JS:

- **Color temperature** by spectral class (the OBAFGKM ramp).
- **Size** by apparent magnitude.
- **Staggered twinkle**: unique duration + phase per star so they never blink in unison.
- **Spectral spike** (diffraction-cross intensity) varying per star.

---

## 6. Full Advantage of Three.js (the "not first-year" bar)

Stock drei helpers (`<Stars>`, `<Float>`) + a single bloom pass is explicitly insufficient; it reads tutorial-level. Rev 2 REQUIRES reaching under the hood. These techniques are the creative differentiators and the acceptance bar:

### 6.1 Custom GLSL shaders (the biggest unlock)

- **Single `Points` buffer starfield** with a custom `RawShaderMaterial`. Per-star attributes: `aColorTemp` (spectral color), `aMagnitude` (size/brightness), `aTwinklePhase` + `aTwinkleSpeed` (unique per star), `aSpike` (spectral diffraction-cross intensity). Thousands of stars, zero per-star draw calls, NONE identical. The anti-clip-art rule is enforced at the GPU level.
- **Twinkle is a shader time-uniform** (`uTime + aTwinklePhase`), never per-star JS setTimeout. Staggered twinkle across thousands of stars for free.
- **Star drift / shimmer** computed in the vertex stage with per-star noise, so the field feels alive without a hot JS loop.
- **Procedural nebula shader** (fragment fbm/simplex noise) as a volumetric billboard layer + a **Milky Way band** of unresolved faint stars. Zero texture assets; infinite; genuinely shifts under the camera.
- **Depth fog** between camera and constellation so the field reads as deep, not flat.

### 6.2 Shader uniforms = the design system

The real stellar color-temperature arc (dim cool to warm ignited to white-hot complete) becomes ONE `uColorTemp`/`uState` uniform ramped per star, so state transitions are buttery GPU interpolations, not discrete color swaps. The ignition surge is a shader-driven wave (uniform per star order), not per-star setTimeout.

### 6.3 Camera as a character

- **Keplerian parallax**: stars sit on multiple depth shells at real relative distances and shift at different rates as the camera moves, so the sky genuinely has depth and rotates around the observer. Real parallax is an astronomical effect; this is physically honest immersion.
- **Cinematic flight** (galaxy): r3f `useFrame` + damped easing (maath) into a dolly-and-tilt pattern with camera keyframes, lookAt slewing, and subtle FOV breathing on ignition. Not a bare position lerp.
- **On-course drift + pointer parallax** so the constellation feels like you are drifting through it.

### 6.4 Post-processing chain

Full EffectComposer: UnrealBloom (per-state tuned) + subtle chromatic aberration on hot stars + vignette + restrained film grain tied to state. Composites on GPU in one pass.

### 6.5 Ignition light-scatter

The fusion moment gets a real light bloom / scatter flare (a sprite that flairs as the star ignites), not just a pinned sprite color swap.

**Perf honesty at full power:** all of the above scales because it is GPU-side: `Points` for stars, fragment shaders for nebula, one EffectComposer chain. Stays within the dpr cap + lazy-load discipline. `Points`/shaders replace the Rev 1 per-star 3-sprite approach for scale; the interactive lesson stars remain higher-fidelity individual sprites (see `IgnitedStar`).

---

## 7. True Immersion (break the flat figure-ground)

The one throughline Chris explicitly kept from the rejected direction. The learner is INSIDE a real depth of sky, not in front of a poster of stars:

- **Real 3D parallax**: stars on multiple depth shells shift at different rates as the camera moves.
- **Volumetric dust**: procedural nebula as a volumetric billboard layer, with depth fog between camera and constellation.
- **Camera as character**: on-course drift + pointer parallax; cinematic dolly-and-tilt flight in the galaxy.
- **Depth fog** so the field reads as deep, not flat.

The learner is an observer inside the sky, watching their progress accrue as a living, breathing field of light.

---

## 8. Real Sky Palette (restrained, NOT generic rainbow space)

Real astrophotography palette: deep near-black navy canvas, cool blue-white field stars, warm golden-white ignited stars, faint warm amber toward completed regions, deep violet for dust depth. The Milky Way band of unresolved field stars runs subtly behind the constellations. Reads as a real deep-sky field, not a rainbow.

**Rule:** max 2-3 nebula color fields at low opacity, so it reads as atmosphere, not a generic purple/teal space gradient.

---

## 9. Rank Ladder to Galaxy Illumination

Rank maps to how much of the galaxy is lit. The galaxy's overall luminance = rank:

| Band | Galaxy illumination | Star treatment |
|---|---|---|
| starseed | 1 sector faintly lit (0.10) | The first constellation barely glows. |
| wayfarer | a few sectors partially lit (0.30) | Dimmer cool stars. |
| explorer | ~half the galaxy lit (0.55) | Brighter stars. |
| polestar | most sectors lit, bright (0.80) | Bright stars + halos. |
| celestial | whole galaxy fully lit, warm (1.00) | Warm luminous everywhere + strong halos. |

---

## 10. Component States (all components)

| State | Star visual | Meaning |
|---|---|---|
| **locked** | faint pinprick, no bloom, no line | Pre-req/future-gated lesson: unborn star |
| **in-progress** | current-star pulse + pulsing halo | The lesson you are on / next to light |
| **ignited** | warm luminous bloom | Lesson completed |
| **complete** | white-hot flare | Constellation complete / certificate |
| **loading** | static unlit + shimmer | Data still fetching |
| **empty** | starfield with 0 lit, editorial copy | No completions yet |
| **error** | constellation renders unlit + inline retry | Failed fetch, never crash the page |
| **no-webgl** | fall back to the 2D component | WebGL unavailable |

**Responsive:** desktop = full 3D canvas. <=768px = compact constellation (fewer stars, camera pulled back) or 2D fallback. Interactive star hit targets >=44px on touch.

---

## 11. Motion & Interaction Notes (for the Web Dev team)

- **Ignition sequence:** lit stars surge on one-by-one in lesson order, ~120ms stagger, scale + bloom ramp. The signature moment.
- **Raycast hover:** star lifts (scale + z-offset) + lesson tooltip. Smooth, ~150ms.
- **Click-to-fly:** camera tweens to the star (ease-in-out, ~600ms) then navigates to the lesson.
- **Camera fly (galaxy):** smooth tween between sectors (~800ms) or instant jump via minimap.
- **Bloom:** UnrealBloom per-state tuned (unlit 0, current low, ignited medium, complete highest). Only lit/current/complete stars bloom; unlit pinpricks and background dust stay below threshold.
- **Reduced motion (G2):** `usePrefersReducedMotion` drives `staticMode`, skipping ignition + parallax + drift + film-grain + camera breathing, settling the camera on a static lit state. `@media (prefers-reduced-motion: reduce)` zeroes DOM transitions + shimmer.

---

## 12. Mood Board (real imagery, verified)

Four generated assets anchor the direction. All verified as real, cinematic astronomy (not clip-art):

| Asset | What it shows | Role |
|---|---|---|
| `moodboards/moodboard-orion-deepsky.png` | Real deep-sky Orion: belt stars, Betelgeuse (orange-red), Rigel (blue-white), M42 nebula in the sword, Milky Way band | The anchor: Orion as a real hunter, the course map |
| `moodboards/moodboard-spectral-ramp.png` | The OBAFGKM spectral sequence, blue to red by temperature | The color language: real stellar temperature arc |
| `moodboards/moodboard-volumetric-dust.png` | Volumetric interstellar dust, layered filaments, depth, inside-the-sky | The immersion: depth, parallax, volumetric dust |
| `moodboards/moodboard-ignition.png` | A young star igniting, warm golden-white, flare of light | The fusion moment: the core reward |

---

## 13. Anti-Slop Self-Audit (this concept)

- **1 Tech gradient:** NONE. The sky is deep near-black navy; stars are real spectral colors, not a blue-violet glossy gradient. Pass.
- **2 Generic tech hue:** NO. The accent is the real stellar temperature arc (OBAFGKM), not indigo. Pass.
- **3 Feature-tile grid:** NO. Surfaces are data (Monitor/Explore), no icon+heading+sentence x3. Pass.
- **4 Accent rail:** NO. The rank ladder uses an inset star/accent, not a decorative left strip. Pass.
- **5 Unearned blur:** NO glassmorphism on the core surfaces; the sky is a deliberate 3D canvas. Pass.
- **6 Monument stat:** streak/rank numbers are real `AchievementStats`, shown once, not filling space. Pass.
- **7 Icon topper:** NO. The star IS the data, not an icon above a heading. Pass.
- **8 Center stack:** NO. The only centered moment is the ignition overlay (Decide/Learn beat). Pass.
- **9 Default type:** Inter kept (existing brand); mono kickers chosen. Pass.
- **10 Wrong surface:** NO. Monitor surfaces, Explore navigation on the galaxy, ignition overlay is the one earned Decide/Learn moment. Pass.

**Slop score: 0/10.** The direction is anchored in real astronomy, not generic space.

---

## 14. Wow-Factor Bar (this concept sets the direction)

1. **Real imagery**: 4 verified mood board assets (Orion deep-sky, spectral ramp, volumetric dust, ignition). Pass.
2. **Motion**: ignition sequence, raycast hover lift, click-to-fly, camera fly, bloom ramp, reduced-motion respected. Pass.
3. **Depth**: Keplerian parallax, volumetric dust, depth fog, layered 3D elevation. Pass.
4. **Typographic scale**: oversized sky display + mono kicker contrast (kept from 2D). Pass.
5. **Craft details**: consistent star/space/radius system, a11y labels, states on everything. Pass.
6. **Signature element**: the **ignition sequence** (lit stars surge on one-by-one in lesson order) + the **navigable galaxy** (camera flies between sectors) + the **M42 sword as the completion anchor**. Pass.

**Bar: 6/6** for the direction. The Web Dev team must hold >=4/6 on every final mockup.

---

## 15. Handoff to the Web Dev Team

- **Files this brief points at:** `concept-brief-immersive-3d.md` (this), `design-tokens-3d.css`, `moodboards/*.png` (4 verified images).
- **Contract alignment:** every component name/type maps to `contracts-constellations.ts`. Do not rename. Use `RankBand`/`Rank`/`LadderProgress` for the ladder. The 3D components are NEW (`SeriesConstellation3D`, `ProfileGalaxy3D`) and consume the same props as the 2D components they replace.
- **Engine:** Three.js via react-three-fiber + drei + @react-three/postprocessing (UnrealBloom). D3 is NOT in the main path.
- **Real-asterism data:** author from a canonical source (IAU constellation charts / Bayer designations). Do not hand-invent positions. Lesson count must equal member-star count used; overflow maps to progressively fainter real members.
- **Rejection floor:** if the build reads as generic space, clip-art circles, or first-year, it is rejected. The AC-7 human visual gate is non-negotiable.
- **Deliverables expected from the Web Dev team:** the working Orion tracker first, then the profile galaxy, then integrate + verify. This concept is input, not the final visual.
