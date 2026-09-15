# design/hubble-field

**There are no mockups in this folder, and there will not be any.**

The mockup for Hubble Field is a running page:

```
npm run dev
→ http://localhost:3000/lab/hubble-field
```

Live WebGL, live parameter controls (star count, magnitude falloff, spike threshold, exposure, dust density, rank illumination), and a framed ↔ observatory mode toggle for reviewing the warp. Visual review happens there, against the real renderer, on a real GPU.

## What's here

| File | What it is |
|---|---|
| `direction-brief.md` | The direction, the star language, and the review method. |
| `CHECKPOINT.md` | Chris review gate — approve the lab before any production port. |

## Where everything else lives

| Doc | Path |
|---|---|
| Visual rejection floor | `docs/hubble-field-north-star.md` |
| Requirements + acceptance criteria | `docs/requirements-hubble-field.md` |
| Architecture, diagnosis, ADRs | `docs/arch-hubble-field.md` |
| Lab route | `src/app/lab/hubble-field/` |
| Lab components | `src/components/Constellations/lab/` |

Each `docs/` markdown file has an HTML twin for sharing. Markdown is the git source of truth.
