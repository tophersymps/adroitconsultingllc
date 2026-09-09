# Hubble Field — Visual North Star

**Tenant:** adroit-blog · **Branch:** `feat/hubble-field` · **Date:** 2026-09-04
**Status:** Phase 1 rejection floor. Supersedes the Sky Roads visual direction.
**Scope:** one page. If a decision isn't on it, it isn't load-bearing.

---

## One line

> A deep field. Near-black, mostly empty, punctured by stars of wildly unequal brightness — and only the ones that burn hardest throw diffraction spikes. You warp into it from your profile, and you stay in it.

## The reference is a photograph

Hubble Deep Field. JWST's first images. Look at one before writing a shader. What makes them read as *real* is not glow — it's **contrast and inequality**. Vast dead black. A handful of stars so bright they bloom into six-point spikes. Hundreds so faint they are one dim pixel. Dust that has *shape* and blocks light instead of tinting the whole frame blue.

Generic space renders the average. A deep field renders the extremes.

---

## Rejection floor — any single one of these is a FAIL

| Fail | Why it's a fail |
|---|---|
| **Cyan HUD chrome** | Reticles, scan-lines, targeting rings, glowing cyan anything. This is a telescope, not a cockpit. |
| **Bokeh orbs** | Soft radial sprites + bloom = out-of-focus lens balls. Stars are *points*, sub-pixel hot, spiked. |
| **CAD lines** | Crisp 1px `LineBasicMaterial` rails between stars. Real asterism figures are faint, additive, and optional. |
| **Uniform stars** | If two stars are the same size and color, the field is clip-art. Magnitude and temperature must vary hard. |
| **Blue wash** | A tinted fog sphere over everything. Dust is *structure* — it occludes, it has edges, it is not a gradient. |
| **Dashboard over sky** | Rank title and stat cards painted on top of the WebGL. Stats live on the page, not on the stars. |
| **Full-page takeover** | The galaxy is a framed section of `/profile` until the user asks for more. |
| **Eject on first click** | Clicking a star must inspect it in place. Navigation is a deliberate second act. |
| **Red stars** | Red is brand chrome. The only exception is an astronomically real red giant, named. |

## The two interaction laws

1. **Warp-in.** The field starts as a framed section inside `/profile` — normal page, normal scroll. One deliberate action expands it to a fullscreen observatory with a warp transition. `Esc` warps out and returns you to the same scroll position. Nothing about the profile page is destroyed to make room for stars.

2. **Stay in the galaxy.** In the observatory you orbit, approach, and inspect. A click on a star selects and reveals it — it never routes. `/learn` opens only from an explicit CTA in the inspect panel. The field is a place, and places don't dump you out the moment you touch them.

## Star language, minimum viable truth

- **Magnitude is a distribution, not a variable.** Most stars near-invisible, a few overwhelming. If the histogram is flat, start over.
- **Color comes from temperature.** OBAFGKM: blue-white through white through amber. Narrow range, high specificity.
- **Spikes are earned.** Diffraction spikes on the brightest few percent only. Spikes on everything is a lens-flare filter.
- **Dust is geometry.** It sits between things, it has form, it takes light away.

---

## The one-question test

Screenshot a frame and show it to someone who has never seen this repo. Ask what it is.

- "A Hubble photo" — **ship it.**
- "A space game map" or "a bloom tutorial" — **it failed.** Fix the field, not the post-processing.

There is no third answer, and no amount of tuning bloom strength produces the first one.
