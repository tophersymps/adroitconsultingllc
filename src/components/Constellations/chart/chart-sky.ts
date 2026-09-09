/**
 * chart-sky.ts — pure backdrop maths for the 2D star chart.
 *
 * Split out from the component so the star field can be tested. The
 * distribution here regressed once already (see `rng` below), and the failure
 * mode — every star collapsing onto a diagonal line — was invisible to any
 * test that only checked counts and ranges.
 */

import { hashString } from "../model/star-model";

/**
 * Nebula clouds. Desaturated and broad: they carry the plate's depth and
 * colour temperature without becoming scenery.
 */
export const NEBULAE = [
  { id: "cxc-neb-a", cx: 250, cy: 300, rx: 420, ry: 330, rot: -18, color: "#3560b8", alpha: 0.62, drift: 74 },
  { id: "cxc-neb-b", cx: 760, cy: 420, rx: 380, ry: 300, rot: 24, color: "#6640a8", alpha: 0.55, drift: 91 },
  { id: "cxc-neb-c", cx: 520, cy: 760, rx: 460, ry: 280, rot: -8, color: "#1f7a90", alpha: 0.45, drift: 108 },
  { id: "cxc-neb-d", cx: 830, cy: 830, rx: 310, ry: 260, rot: 40, color: "#94476e", alpha: 0.4, drift: 83 },
  { id: "cxc-neb-e", cx: 140, cy: 720, rx: 330, ry: 270, rot: 12, color: "#35509c", alpha: 0.45, drift: 97 },
] as const;

export interface BgStar {
  x: number;
  y: number;
  r: number;
  o: number;
  dur: number;
  delay: number;
}

/**
 * Seeded PRNG stream (mulberry32).
 *
 * Do NOT reach for `seededUnit(seed + key)` to pull several values off one
 * item. FNV-1a turns a one-character difference in the seed into a nearly
 * constant difference in the output: `"far-0-x"` and `"far-0-y"` differ by a
 * single low bit before the final multiply, so the two results land ~0.004
 * apart and the entire field collapses onto the line y = x. A single
 * advancing stream decorrelates successive draws properly.
 */
export function rng(seed: string): () => number {
  let a = hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Extent the field is drawn over — past the viewBox, so parallax can't expose an edge. */
export const SKY_MIN = -60;
export const SKY_SPAN = 1120;

/**
 * Field width override for a wide viewBox. The chart's *content* (constellation
 * figures) lives in a fixed ~1000-unit square centred on (500,520), but the
 * container the SVG sits in is wide (16:9-ish). If the background stars only
 * fill a square, the sides of the frame show a bare-gradient letterbox — the
 * "squared off" plate. Spreading the field to the full viewBox width makes the
 * galaxy reach every edge while the content stays centred.
 */
export const SKY_ASPECT_WIDTH = 1882;

/**
 * Deterministic backdrop stars — identical on server and client, so the field
 * never causes a hydration mismatch. `fieldW` lets the caller spread the stars
 * over a wide viewBox (default: the square field).
 */
export function bgStars(
  count: number,
  prefix: string,
  rRange: [number, number],
  oRange: [number, number],
  fieldW = SKY_SPAN,
): BgStar[] {
  const next = rng(prefix);
  const out: BgStar[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: SKY_MIN + next() * fieldW,
      y: SKY_MIN + next() * SKY_SPAN,
      r: rRange[0] + next() * (rRange[1] - rRange[0]),
      o: oRange[0] + next() * (oRange[1] - oRange[0]),
      dur: 2.6 + next() * 4.4,
      delay: -next() * 7,
    });
  }
  return out;
}

/** Pearson correlation of x against y — the diagonal-collapse detector. */
export function xyCorrelation(stars: BgStar[]): number {
  const n = stars.length;
  if (n < 2) return 0;
  const mx = stars.reduce((a, s) => a + s.x, 0) / n;
  const my = stars.reduce((a, s) => a + s.y, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const s of stars) {
    num += (s.x - mx) * (s.y - my);
    dx += (s.x - mx) ** 2;
    dy += (s.y - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 1 : num / den;
}
