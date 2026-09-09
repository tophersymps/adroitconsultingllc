# Checkpoint — Hubble Field lab review

**Status (2026-09-04): direction accepted — the 2D Star chart is the baseline.**
Chris: *"we're starting over with this 2d model … we'll implement this as phase
one and work from there. Hopefully in another version we can get closer to the
end-product. This at least is understandable."*

Read that as: **legible beats ambitious, and the chart is a floor, not a
ceiling.** Port it, get it in front of real progress data, iterate from there.

**Direction pivot (2026-09-04):** primary look is **Star chart** — a top-down navy + gold celestial atlas plate (Urania’s Mirror / Jamieson cues), not a pitch-black Hubble flythrough. **The 3D production port described in earlier plan revisions is void.**

Next: `docs/implementation-plan-hubble-field.md` (rewritten chart-first). Its
§10 holds four open questions that need answers before or during the port.

## Deleted (2026-09-04)

The lab began as four WebGL studies — star material, deep field, volume atlas,
warp — plus their shared canvas, shaders, dust volume and control panel. They
were built, reviewed and rejected: faithful to Hubble, unreadable as a progress
surface. **All of it has been deleted**, taking the lab from eighteen files to
six. Nothing was kept "just in case"; git history holds it if the reasoning
ever needs revisiting.

What survives is the chart and the fixtures that feed it:

| File | Role |
|---|---|
| `chart-atlas.tsx` | The chart |
| `chart-2d.css` | Its styles |
| `chart-sky.ts` | Backdrop maths (pure, tested) |
| `field-fixtures.ts` | Synthetic courses + the seven asterisms |
| `HubbleFieldLab.tsx` | Focus state around the chart |
| `lab.test.ts` | 12 tests |

## How to review

```
npm run dev
→ http://localhost:3000/lab/hubble-field
```

There are no studies to switch between any more — the chart is the lab.

## Figure art (2026-09-04)

Each course constellation now carries an engraved drawing of what it depicts —
Orion the hunter, Cygnus the swan, Corona Borealis the crown, and so on. Assets
live in `public/constellations/*.png` as grayscale plates; the chart keys them
with an SVG `feColorMatrix` that takes alpha from luminance and replaces the
colour with a flat tint, so they render as apparitions rather than pasted
images. Cool blue = course in progress, warm gold = complete. Toggle them off
in the chart header to compare against bare lines.

## Depth & motion (2026-09-04)

Three parallax bands track the pointer at different rates — nebulae and the
deep star field barely move, the graticule sits between, the courses move most.
Behind that: a lit dome gradient, five drifting nebula clouds, ~420 deterministic
stars (seeded so SSR and client agree), a faint atlas graticule, and a vignette.
Ambient sky is also painted on the panel in CSS, because the SVG keeps a square
aspect and letterboxes on wide viewports.

Backdrop maths lives in `chart-sky.ts` so it can be tested. The star field uses
a mulberry32 stream, **not** `seededUnit(seed + key)` — FNV-1a maps a
one-character seed difference to a near-constant output difference, which once
collapsed the entire field onto the line y = x. `lab.test.ts` guards this with
a correlation check; range assertions alone did not catch it.

Motion is all CSS: stars twinkle on `fill-opacity` so per-star brightness
survives, apparitions breathe on a stagger, sparks run the completed rails
(`pathLength=100` normalises speed across segment lengths), finished exam stars
pulse, completion rings rotate, and two meteors cross on long cycles. The whole
set is disabled under `prefers-reduced-motion`.

## Pass / fail

- **Pass:** feels like a luminous fantasy star atlas you want to explore — still readable as *your* learning sky. Figures read as ghosts behind the stars; the constellation lines stay crisp on top of them.
- **Fail:** pitch-black void, cyan HUD, CAD stick figures with no mythic presence, or artwork so loud it buries the star lines.

## After approval

1. Follow `docs/implementation-plan-hubble-field.md` — rewritten chart-first; §3 is the real work
2. Port into production profile / series
3. CHANGELOG + README What’s New on ship only
