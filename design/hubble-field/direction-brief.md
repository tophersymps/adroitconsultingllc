# Hubble Field — Direction Brief

**Tenant:** adroit-blog · **Branch:** `feat/hubble-field` · **Date:** 2026-09-04
**Surface:** the galaxy section of `/profile`, and its fullscreen observatory
**Visual floor:** `docs/hubble-field-north-star.md`

---

## The mockup is a page, not a picture

**`/lab/hubble-field` is the deliverable.** It is a real WebGL page with live parameter controls, and it is where every visual decision on this feature gets made and reviewed.

No `mockup-*.html` starfield posters. Not one. Two previous rounds produced hand-tuned HTML fields that looked correct in a browser tab and could not be reproduced in Three.js, which is how we ended up reviewing an aesthetic nobody could ship. A poster can fake a magnitude distribution with a Photoshop gradient; a shader has to earn it. Review the shader.

## Direction

Point a telescope at the record of what someone has learned. Near-black, mostly empty, unevenly punctured. A few stars are overwhelming and throw spikes; most are barely there. Dust has form and takes light away. Nothing glows for decoration.

The feeling is **observation**, not piloting. There is no cockpit, no reticle, no scan-line, no cyan. The user is behind the eyepiece, not at the controls.

## Composition

- **Framed** — the field lives in a bounded section of `/profile`. Rank, stats, and chronicle sit on the page around it as ordinary page content. Nothing is printed on the stars.
- **Observatory** — one deliberate action warps the field to fullscreen. Here the user can orbit, approach a constellation, and inspect a star. `Esc` warps back to exactly where they were.
- **Inspect before exit** — a click resolves and reveals. Leaving for `/learn` requires an explicit CTA. The field is somewhere you stay.

## Star language

| Element | Direction |
|---|---|
| Magnitude | Steep distribution. Most stars near the visibility floor, a handful dominant. Flat = fail. |
| Color | Spectral temperature only, OBAFGKM. Blue-white → white → amber. Narrow, specific, never rainbow. |
| Spikes | The brightest few percent only, intensity scaled by magnitude. Spikes on everything is a lens-flare filter. |
| Figure lines | Faint, additive, recessive. A hint of the asterism, never a wireframe of it. |
| Dust | Structure with edges and occlusion. Not a tint over the frame. |
| Red | Brand chrome. On a star only if that star is a real, named red giant. |

## Rejected on sight

Cyan HUD · bokeh orbs · CAD rails · uniform stars · blue wash nebula · stat cards over the canvas · full-page takeover · routing on first click.

## How this gets reviewed

Screenshot the lab. Show it to someone cold. If they say "Hubble photo," it passes. If they say "space game" or "bloom demo," the field is wrong — and the fix is in the field, not the post-processing chain.
