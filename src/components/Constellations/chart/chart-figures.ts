/**
 * chart-figures.ts — where figures sit on the plate, and what art they wear.
 *
 * Pure. Both halves exist because the lab hardcoded them: seven `[cx, cy,
 * scale]` slots and a seven-entry art map, neither of which survives a course
 * being added, removed, or hidden by access rules.
 */

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */

/** Plate centre and the radius figures are allowed to occupy, in viewBox units. */
const CENTRE_X = 500;
const CENTRE_Y = 520;
const MAX_RADIUS = 330;

/** 137.5° — consecutive indices land far apart, so the sky reads as scattered. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Packing capacity tiers.
 *
 * A Vogel spiral normalised by the *live* course count would reflow every
 * figure whenever a course appeared, which §3.3 of the plan rules out. A
 * spiral normalised by a fixed capacity never reflows but wastes most of the
 * plate at seven courses. Tiers split the difference: layout is a function of
 * the tier, so adding a course inside the current tier moves nothing, and only
 * crossing a tier boundary reshuffles.
 */
const CAPACITY_TIERS = [8, 12, 18, 26, 36, 50] as const;

export function layoutCapacity(count: number): number {
  for (const tier of CAPACITY_TIERS) if (count <= tier) return tier;
  // Past the last tier, step in twelves so growth stays chunky.
  return Math.ceil(count / 12) * 12;
}

export interface ChartSlot {
  cx: number;
  cy: number;
  /** Multiplier on the figure's base span. */
  scale: number;
}

/**
 * How far in the innermost figure sits, as a fraction of `MAX_RADIUS`.
 *
 * Even-area packing (`r ∝ √i`) is right for a full sky and wrong for a sparse
 * one: with seven courses it drops the first figures near the centre and leaves
 * the outer plate empty, so the sky reads as a huddle rather than a chart. An
 * inner bound pushes a sparse catalog out into a ring and relaxes to zero — the
 * full disc — once there are enough figures to fill it.
 */
function innerFraction(capacity: number): number {
  return Math.min(0.58, Math.max(0, 1 - capacity / 18));
}

/**
 * Deterministic slot per course index.
 *
 * Phyllotaxis: a golden-angle turn each step, which is how a sunflower packs
 * seeds without rows lining up. Radius interpolates between `innerFraction` and
 * the plate edge on a √ curve, so density stays even across whatever band is in
 * use. Index-driven, so the same catalog always produces the same sky.
 */
export function chartLayout(count: number): ChartSlot[] {
  if (count <= 0) return [];
  const capacity = layoutCapacity(count);
  const inner = innerFraction(capacity);

  const positions = Array.from({ length: count }, (_, i) => {
    const spread = Math.sqrt((i + 0.5) / capacity);
    const radius = MAX_RADIUS * (inner + (1 - inner) * spread);
    const theta = i * GOLDEN_ANGLE;
    return {
      cx: CENTRE_X + Math.cos(theta) * radius,
      cy: CENTRE_Y + Math.sin(theta) * radius,
    };
  });

  /*
   * Size figures off the tightest gap the layout actually produced rather than a
   * guess from the capacity. A figure's drawn extent is about `2 × 70 × scale`,
   * so half the nearest-neighbour distance is the ceiling before they touch.
   */
  let tightest = Infinity;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const d = Math.hypot(
        positions[i]!.cx - positions[j]!.cx,
        positions[i]!.cy - positions[j]!.cy,
      );
      if (d < tightest) tightest = d;
    }
  }
  /*
   * Spacing alone decides the size. Any fixed floor eventually exceeds
   * `tightest / 140` and reintroduces the collisions it was clamping away —
   * first at 26 courses, then at 50 as the floor was lowered. A lone figure has
   * no neighbour to crowd, so it takes the maximum.
   *
   * The consequence is that a very large catalog draws very small figures. That
   * is the honest failure mode: past roughly three dozen courses the answer is a
   * different presentation (paging, or zoom into a region), not a smaller
   * engraving. The chart degrades legibly instead of overlapping.
   */
  const scale = Number.isFinite(tightest) ? Math.min(1.6, tightest / 150) : 1.6;

  return positions.map((p) => ({ ...p, scale }));
}

/* ------------------------------------------------------------------ */
/*  Figure art                                                         */
/* ------------------------------------------------------------------ */

/** Served format. See `PLATE_SLUGS` for why there is no PNG alongside it. */
const PLATE_EXT = "webp";

/**
 * The engraved plates in `public/constellations/`, by constellation slug.
 *
 * The full IAU 88, so mapping a new course to any real constellation gets art
 * for free — no new illustration, just a mapping. `chart.test.ts` asserts this
 * list against what is actually on disk, because a missing file renders as a
 * broken `<image>` and there is no runtime existence check in the browser.
 *
 * WebP only, with no PNG fallback, for two reasons. There is no way to express
 * one inside SVG `<image>` — no `srcset`, no `<picture>` — short of a
 * `<foreignObject>`, which brings its own problems. And the loss is invisible
 * here regardless: the chart never shows the plate directly, it reads the
 * plate's *luminance* through `feColorMatrix` and then blurs the result, so q90
 * artifacts sit well below what survives that pipeline. It cut the plates from
 * 14.7 MB to 6.5 MB, and a seven-course sky from ~1.2 MB to ~540 KB.
 */
export const PLATE_SLUGS: ReadonlySet<string> = new Set([
  "andromeda", "antlia", "apus", "aquarius", "aquila", "ara", "aries",
  "auriga", "bootes", "caelum", "camelopardalis", "cancer", "canes-venatici",
  "canis-major", "canis-minor", "capricornus", "carina", "cassiopeia",
  "centaurus", "cepheus", "cetus", "chamaeleon", "circinus", "columba",
  "coma-berenices", "corona-australis", "corona-borealis", "corvus", "crater",
  "crux", "cygnus", "delphinus", "dorado", "draco", "equuleus", "eridanus",
  "fornax", "gemini", "grus", "hercules", "horologium", "hydra", "hydrus",
  "indus", "lacerta", "leo", "leo-minor", "lepus", "libra", "lupus", "lynx",
  "lyra", "mensa", "microscopium", "monoceros", "musca", "norma", "octans",
  "ophiuchus", "orion", "pavo", "pegasus", "perseus", "phoenix", "pictor",
  "pisces", "piscis-austrinus", "puppis", "pyxis", "reticulum", "sagitta",
  "sagittarius", "scorpius", "sculptor", "scutum", "serpens", "sextans",
  "taurus", "telescopium", "triangulum", "triangulum-australe", "tucana",
  "ursa-major", "ursa-minor", "vela", "virgo", "volans", "vulpecula",
]);

export interface FigureArt {
  src: string;
  /** Size as a multiple of the figure's base span. */
  scale: number;
  /** Offset in units of the base span. */
  dx: number;
  dy: number;
}

const DEFAULT_ART = { scale: 2.35, dx: 0, dy: -0.04 };

/**
 * Per-constellation placement nudges.
 *
 * Only constellations whose engraving does not sit well on its stars under the
 * default need an entry. Everything else takes `DEFAULT_ART`, which is what
 * makes the 88 usable without 88 hand-tuned records.
 */
const ART_TUNING: Record<string, Partial<typeof DEFAULT_ART>> = {
  orion: { scale: 2.5, dy: -0.08 },
  cassiopeia: { scale: 2.3, dy: -0.1 },
  lyra: { scale: 2.4, dy: -0.05 },
  corvus: { scale: 2.2, dy: 0 },
  delphinus: { scale: 2.3, dy: 0 },
  "corona-borealis": { scale: 2.4, dy: 0.05 },
  cygnus: { scale: 2.5, dy: 0 },
};

/** Constellation display name → plate slug. "Corona Borealis" → "corona-borealis". */
export function plateSlug(figureName: string): string {
  return figureName
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}

/**
 * The plate a figure wears, or null when there is none.
 *
 * Null is a supported state, not an error: the figure still renders its lines,
 * labels and progress. Never return a `src` for a plate that is not on disk —
 * a broken `<image>` is worse than no art.
 */
export function figureArtFor(figureName: string | null): FigureArt | null {
  if (!figureName) return null;
  const slug = plateSlug(figureName);
  if (!PLATE_SLUGS.has(slug)) return null;
  return {
    src: `/constellations/${slug}.${PLATE_EXT}`,
    ...DEFAULT_ART,
    ...ART_TUNING[slug],
  };
}
