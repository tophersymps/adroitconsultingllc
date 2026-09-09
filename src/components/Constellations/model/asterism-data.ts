/**
 * asterism-data.ts — PURE real-asterism data (no three/r3f imports).
 *
 * 3D-only. The leftover WebGL stack (`star-model`, `SeriesConstellation3D`,
 * `labAsterismFor`) still keys a figure by `seriesSlug` and still requires
 * lesson count to equal member-star count. The production star chart does
 * **not** read this file: it assigns from `chart/figure-catalog.ts` by the
 * curriculum's final lesson count, because a slug→constellation map cannot
 * answer "which figure fits a 10-lesson course" and it cannot stay stable
 * while lessons land daily.
 *
 * ADR-307 (REV 2) still applies *here*: the 3D tracker is grounded in real
 * astronomy. Each course maps to a named constellation whose Bayer members
 * are authored with real coordinates, spectral class, and apparent magnitude.
 * Where a course has more lessons than bright members, overflow maps to
 * fainter real members of that constellation.
 *
 * This module is the 3D loader's authored source. `buildSeriesStars`
 * (star-model) provides a deterministic scaffold fallback; the scene overlays
 * this data by seriesSlug so the figure reads as the actual constellation.
 *
 * Coordinates are J2000 (RA in hours, Dec in degrees). Positions are projected
 * onto the constellation plane (equirectangular-ish, centered on the figure)
 * and scaled to fit the 3D scene; depth (z) is a deterministic per-star offset
 * so the camera parallax feels real.
 */
import type { SpectralClass, Star3D } from "./star-model";
import { spectralColorFor, BETELGEUSE_ACCENT, magnitudeSizeFor } from "./star-model";

/** One real member star of a constellation. */
export interface AsterismStar {
  /** Bayer designation / catalogue name (e.g. "Betelgeuse (α Ori)"). */
  name: string;
  /** Right ascension, hours (J2000). */
  raH: number;
  /** Declination, degrees (J2000). */
  decDeg: number;
  /** Real spectral class (OBAFGKM). */
  spectralClass: SpectralClass;
  /** Real apparent magnitude (lower = brighter). */
  magnitude: number;
  /** True for astronomically-red members (Betelgeuse) — ADR-303 accent. */
  isRedGiantAccent?: boolean;
  /** True for a nebula anchor (M42 — the ignition/completion anchor). */
  isNebula?: boolean;
}

/** A full authored constellation figure. */
export interface Asterism {
  /** seriesSlug this asterism maps to. */
  seriesSlug: string;
  /** Human constellation name. */
  name: string;
  /** Member stars in lesson order (index i → lesson i). */
  stars: AsterismStar[];
  /**
   * The real asterism's connecting figure, as pairs of star indices (into
   * `stars`). Draws the recognizable constellation (belt line, shoulders,
   * feet, sword) rather than a lesson-order zigzag.
   */
  connections: [number, number][];
}

/* ------------------------------------------------------------------ */
/*  ORION — the hunter (Salesforce System Architect Primer, 29 lessons) */
/* ------------------------------------------------------------------ */
const ORION: Asterism = {
  seriesSlug: "salesforce-architect",
  name: "Orion",
  stars: [
    // The bright figure (9 anchors): shoulders, belt, feet, head, sword.
    { name: "Betelgeuse (α Ori)", raH: 5.9167, decDeg: 7.41, spectralClass: "M", magnitude: 0.42, isRedGiantAccent: true },
    { name: "Bellatrix (γ Ori)", raH: 5.4167, decDeg: 6.35, spectralClass: "B", magnitude: 1.64 },
    { name: "Alnitak (ζ Ori)", raH: 5.6833, decDeg: -1.94, spectralClass: "O", magnitude: 1.77 },
    { name: "Alnilam (ε Ori)", raH: 5.6, decDeg: -1.2, spectralClass: "B", magnitude: 1.69 },
    { name: "Mintaka (δ Ori)", raH: 5.5333, decDeg: -0.3, spectralClass: "O", magnitude: 2.23 },
    { name: "Saiph (κ Ori)", raH: 5.8, decDeg: -9.67, spectralClass: "B", magnitude: 2.09 },
    { name: "Rigel (β Ori)", raH: 5.25, decDeg: -8.2, spectralClass: "B", magnitude: 0.13 },
    { name: "Meissa (λ Ori)", raH: 5.5833, decDeg: 9.93, spectralClass: "O", magnitude: 3.39 },
    { name: "M42 · Orion Nebula", raH: 5.5833, decDeg: -5.38, spectralClass: "G", magnitude: 4.0, isNebula: true },
    // Fainter real members (overflow lessons → progressively fainter).
    { name: "π³ Ori", raH: 4.8333, decDeg: 6.96, spectralClass: "F", magnitude: 3.19 },
    { name: "π⁴ Ori", raH: 4.85, decDeg: 5.6, spectralClass: "B", magnitude: 3.68 },
    { name: "π⁵ Ori", raH: 4.9, decDeg: 2.7, spectralClass: "B", magnitude: 3.71 },
    { name: "σ Ori", raH: 5.65, decDeg: -2.6, spectralClass: "O", magnitude: 3.77 },
    { name: "τ Ori", raH: 5.3, decDeg: -6.85, spectralClass: "B", magnitude: 3.59 },
    { name: "χ Ori", raH: 5.9, decDeg: 20.27, spectralClass: "G", magnitude: 4.39 },
    { name: "φ Ori", raH: 5.5667, decDeg: 9.5, spectralClass: "G", magnitude: 4.42 },
    { name: "υ Ori", raH: 5.5167, decDeg: -7.3, spectralClass: "B", magnitude: 4.62 },
    { name: "θ¹ Ori · Trapezium", raH: 5.5833, decDeg: -5.38, spectralClass: "O", magnitude: 4.0 },
    { name: "ι Ori", raH: 5.5833, decDeg: -5.92, spectralClass: "O", magnitude: 2.77 },
    { name: "42 Ori", raH: 5.6, decDeg: -4.72, spectralClass: "B", magnitude: 4.58 },
    { name: "52 Ori", raH: 5.8, decDeg: 6.45, spectralClass: "A", magnitude: 5.99 },
    { name: "69 Ori", raH: 6.2, decDeg: 16.5, spectralClass: "B", magnitude: 4.78 },
    { name: "71 Ori", raH: 6.2333, decDeg: 19.0, spectralClass: "F", magnitude: 5.2 },
    { name: "72 Ori", raH: 6.2667, decDeg: 16.0, spectralClass: "B", magnitude: 5.34 },
    { name: "73 Ori", raH: 6.3167, decDeg: 16.0, spectralClass: "B", magnitude: 5.44 },
    { name: "74 Ori", raH: 6.3333, decDeg: 12.0, spectralClass: "F", magnitude: 5.04 },
    { name: "75 Ori", raH: 6.35, decDeg: 9.0, spectralClass: "A", magnitude: 5.09 },
    { name: "76 Ori", raH: 6.3667, decDeg: 14.0, spectralClass: "K", magnitude: 5.55 },
        { name: "77 Ori", raH: 6.3833, decDeg: 20.0, spectralClass: "A", magnitude: 5.19 },
      ],
      // The real hunter figure: shoulders, belt line, feet, sword (M42), head.
      connections: [
        [0, 1], // Betelgeuse — Bellatrix (shoulders)
        [0, 2], // Betelgeuse — Alnitak (left shoulder to belt)
        [1, 4], // Bellatrix — Mintaka (right shoulder to belt)
        [2, 3], // Alnitak — Alnilam (belt)
        [3, 4], // Alnilam — Mintaka (belt)
        [2, 5], // Alnitak — Saiph (left belt to foot)
        [4, 6], // Mintaka — Rigel (right belt to foot)
        [2, 8], // Alnitak — M42 (belt to sword)
        [4, 8], // Mintaka — M42 (belt to sword)
        [7, 0], // Meissa — Betelgeuse (head to shoulder)
        [7, 1], // Meissa — Bellatrix (head to shoulder)
      ],
    };

/* ------------------------------------------------------------------ */
/*  CASSIOPEIA — the W (Agentic AI, 5 bright members)                 */
/* ------------------------------------------------------------------ */
const CASSIOPEIA: Asterism = {
  seriesSlug: "agentic-ai",
  name: "Cassiopeia",
  stars: [
    { name: "Segin (ε Cas)", raH: 1.9, decDeg: 63.67, spectralClass: "B", magnitude: 3.38 },
    { name: "Ruchbah (δ Cas)", raH: 1.45, decDeg: 60.24, spectralClass: "A", magnitude: 2.68 },
    { name: "γ Cas", raH: 0.95, decDeg: 60.72, spectralClass: "B", magnitude: 2.47 },
    { name: "Schedar (α Cas)", raH: 0.67, decDeg: 56.54, spectralClass: "K", magnitude: 2.24 },
        { name: "Caph (β Cas)", raH: 0.15, decDeg: 59.15, spectralClass: "F", magnitude: 2.28 },
          ],
          // The real W: Segin — Ruchbah — γ Cas — Schedar — Caph.
          connections: [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 4],
          ],
        };

/* ------------------------------------------------------------------ */
/*  LYRA — the lyre (OmniStudio cert, 6 members)                      */
/* ------------------------------------------------------------------ */
const LYRA: Asterism = {
  seriesSlug: "omni-studio-cert",
  name: "Lyra",
  stars: [
    { name: "Vega (α Lyr)", raH: 18.6156, decDeg: 38.78, spectralClass: "A", magnitude: 0.03 },
    { name: "ζ¹ Lyr", raH: 18.7461, decDeg: 37.6, spectralClass: "A", magnitude: 4.36 },
    { name: "Sheliak (β Lyr)", raH: 18.8347, decDeg: 33.36, spectralClass: "B", magnitude: 3.52 },
    { name: "Sulafat (γ Lyr)", raH: 18.9822, decDeg: 32.69, spectralClass: "B", magnitude: 3.24 },
    { name: "δ² Lyr", raH: 18.9, decDeg: 36.9, spectralClass: "M", magnitude: 4.3 },
    { name: "ε Lyr", raH: 18.7392, decDeg: 39.67, spectralClass: "A", magnitude: 4.6 },
  ],
  // Vega, then the parallelogram closing back on ζ¹.
  connections: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 1],
    [0, 5],
  ],
};

/* ------------------------------------------------------------------ */
/*  CORVUS — the crow (Hermes consultant, 5 members)                  */
/* ------------------------------------------------------------------ */
const CORVUS: Asterism = {
  seriesSlug: "hermes-consultant",
  name: "Corvus",
  stars: [
    { name: "Gienah (γ Crv)", raH: 12.2634, decDeg: -17.54, spectralClass: "B", magnitude: 2.59 },
    { name: "Algorab (δ Crv)", raH: 12.4979, decDeg: -16.52, spectralClass: "B", magnitude: 2.95 },
    { name: "Kraz (β Crv)", raH: 12.5721, decDeg: -23.4, spectralClass: "G", magnitude: 2.65 },
    { name: "Minkar (ε Crv)", raH: 12.1683, decDeg: -22.62, spectralClass: "K", magnitude: 3.02 },
    { name: "Alchiba (α Crv)", raH: 12.1405, decDeg: -24.73, spectralClass: "F", magnitude: 4.02 },
  ],
  // Alchiba into the "sail" quadrilateral.
  connections: [
    [4, 3],
    [3, 0],
    [0, 1],
    [1, 2],
    [2, 3],
  ],
};

/* ------------------------------------------------------------------ */
/*  DELPHINUS — the dolphin (Hermes intermediate, 5 members)          */
/* ------------------------------------------------------------------ */
const DELPHINUS: Asterism = {
  seriesSlug: "hermes-consultant-intermediate",
  name: "Delphinus",
  stars: [
    { name: "Rotanev (β Del)", raH: 20.6255, decDeg: 14.6, spectralClass: "F", magnitude: 3.63 },
    { name: "Sualocin (α Del)", raH: 20.6607, decDeg: 15.91, spectralClass: "B", magnitude: 3.77 },
    { name: "γ Del", raH: 20.7758, decDeg: 16.12, spectralClass: "K", magnitude: 4.27 },
    { name: "δ Del", raH: 20.7325, decDeg: 15.07, spectralClass: "A", magnitude: 4.43 },
    { name: "ε Del", raH: 20.5566, decDeg: 11.3, spectralClass: "B", magnitude: 4.03 },
  ],
  // The tail (ε) into Job's Coffin.
  connections: [
    [4, 0],
    [0, 3],
    [3, 2],
    [2, 1],
    [1, 0],
  ],
};

/* ------------------------------------------------------------------ */
/*  CORONA BOREALIS — the northern crown (Hermes advanced, 6 members) */
/* ------------------------------------------------------------------ */
const CORONA_BOREALIS: Asterism = {
  seriesSlug: "hermes-consultant-advanced",
  name: "Corona Borealis",
  stars: [
    { name: "Alphecca (α CrB)", raH: 15.5781, decDeg: 26.71, spectralClass: "A", magnitude: 2.22 },
    { name: "Nusakan (β CrB)", raH: 15.4638, decDeg: 29.11, spectralClass: "F", magnitude: 3.68 },
    { name: "γ CrB", raH: 15.7108, decDeg: 26.3, spectralClass: "B", magnitude: 3.84 },
    { name: "θ CrB", raH: 15.5486, decDeg: 31.36, spectralClass: "B", magnitude: 4.14 },
    { name: "δ CrB", raH: 15.8267, decDeg: 26.07, spectralClass: "G", magnitude: 4.63 },
    { name: "ε CrB", raH: 15.9585, decDeg: 26.88, spectralClass: "K", magnitude: 4.15 },
  ],
  // The arc of the crown, θ round to ε.
  connections: [
    [3, 1],
    [1, 0],
    [0, 2],
    [2, 4],
    [4, 5],
  ],
};

/* ------------------------------------------------------------------ */
/*  CYGNUS — the swan / Northern Cross (AI at work, 6 members)        */
/* ------------------------------------------------------------------ */
const CYGNUS: Asterism = {
  seriesSlug: "ai-at-work",
  name: "Cygnus",
  stars: [
    { name: "Deneb (α Cyg)", raH: 20.6905, decDeg: 45.28, spectralClass: "A", magnitude: 1.25 },
    { name: "Sadr (γ Cyg)", raH: 20.3705, decDeg: 40.26, spectralClass: "F", magnitude: 2.23 },
    { name: "δ Cyg", raH: 19.7495, decDeg: 45.13, spectralClass: "B", magnitude: 2.87 },
    { name: "Gienah (ε Cyg)", raH: 20.7702, decDeg: 33.97, spectralClass: "K", magnitude: 2.48 },
    { name: "Albireo (β Cyg)", raH: 19.5121, decDeg: 27.96, spectralClass: "K", magnitude: 3.08 },
    { name: "ζ Cyg", raH: 21.2149, decDeg: 30.23, spectralClass: "G", magnitude: 3.2 },
  ],
  // The cross: Deneb down the spine through Sadr, wings out to δ and ε.
  connections: [
    [0, 1],
    [1, 3],
    [1, 2],
    [1, 4],
    [3, 5],
  ],
};

/**
 * All authored asterisms, keyed by seriesSlug.
 *
 * Orion and Cassiopeia predate the chart. The other five were authored in the
 * Hubble Field lab and promoted here in the Phase 2 port — real coordinates,
 * not generated rings, because a ring of equidistant equal stars is invented
 * scatter wearing a course name.
 */
const ASTERISMS: Record<string, Asterism> = {
  [ORION.seriesSlug]: ORION,
  [CASSIOPEIA.seriesSlug]: CASSIOPEIA,
  [LYRA.seriesSlug]: LYRA,
  [CORVUS.seriesSlug]: CORVUS,
  [DELPHINUS.seriesSlug]: DELPHINUS,
  [CORONA_BOREALIS.seriesSlug]: CORONA_BOREALIS,
  [CYGNUS.seriesSlug]: CYGNUS,
};

/** Look up the authored asterism for a series, or null if unknown. */
export function asterismFor(seriesSlug: string): Asterism | null {
  return ASTERISMS[seriesSlug] ?? null;
}

/** True when a series has an authored real asterism. */
export function hasAsterism(seriesSlug: string): boolean {
  return seriesSlug in ASTERISMS;
}

/**
 * Project an asterism's member stars onto the 3D constellation plane.
 *
 * RA/Dec (J2000) → equirectangular-ish plane centered on the figure's centroid,
 * scaled to fit a ~10-unit-wide box. Depth (z) is a deterministic per-star
 * offset so the camera parallax reads as real distance. Deterministic: same
 * asterism → same positions every call.
 */
export function projectAsterism(
  asterism: Asterism,
  scale = 6.5,
): { name: string; position: [number, number, number]; spectralClass: SpectralClass; magnitude: number; isRedGiantAccent?: boolean; isNebula?: boolean }[] {
  const stars = asterism.stars;
    if (stars.length === 0) return [];

    // The recognizable figure is defined by the BRIGHT anchors (the belt,
    // shoulders, feet, sword). Compute the centroid + scale from those so the
    // figure fills the frame; the fainter members scatter around it at their
    // real relative positions without distorting the shape.
    const anchors = stars.filter((s) => s.magnitude < 3.5);
    const layout = anchors.length > 0 ? anchors : stars;

    const raDeg = layout.map((s) => s.raH * 15);
    const dec = layout.map((s) => s.decDeg);
    const cRa = raDeg.reduce((a, b) => a + b, 0) / raDeg.length;
    const cDec = dec.reduce((a, b) => a + b, 0) / dec.length;

    // Scale so the widest axis spans `scale` world units.
    const xs = raDeg.map((r) => r - cRa);
    const ys = dec.map((d) => d - cDec);
    const maxSpan = Math.max(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      1e-6,
    );
    const k = scale / maxSpan;

  return stars.map((s, i) => {
      // Flip RA so higher RA (east) reads LEFT, matching how Orion appears in
      // the sky (Betelgeuse upper-left, Bellatrix upper-right, belt diagonal).
      const x = (cRa - s.raH * 15) * k;
      const y = (s.decDeg - cDec) * k;
      // Deterministic depth: gentle per-star z so the figure has real parallax.
      const z = Math.sin(i * 2.399) * 0.9 + ((i * 7) % 5) * 0.18 - 0.4;
      return {
        name: s.name,
        position: [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))],
        spectralClass: s.spectralClass,
        magnitude: s.magnitude,
        isRedGiantAccent: s.isRedGiantAccent,
        isNebula: s.isNebula,
      };
    });
  }

  /**
   * Overlay the authored real asterism onto a Star3D set (ADR-307).
   *
   * `buildSeriesStars` (star-model) provides a deterministic scaffold; when the
   * series has an authored asterism, this replaces each lesson star's position,
   * spectral class, magnitude, and red-giant accent with the REAL member-star
   * data (in lesson order). Keeps star-model.ts READ-ONLY. Deterministic.
   */
  export function overlayAsterism(
    stars: Star3D[],
    seriesSlug: string,
  ): Star3D[] {
    const asterism = asterismFor(seriesSlug);
    if (!asterism) return stars;
    const projected = projectAsterism(asterism);
    if (projected.length === 0) return stars;

    return stars.map((star, i) => {
          const real = projected[i % projected.length];
          if (!real) return star;
          // Real spectral color (OBAFGKM) drives the lit star's cast; Betelgeuse
          // keeps its authentic orange-red accent (ADR-303). The M42 nebula anchor
          // reads warm as the stellar nursery.
          const spectralColor = real.isRedGiantAccent
            ? BETELGEUSE_ACCENT
            : real.isNebula
              ? "#ffd9a8"
              : spectralColorFor(real.spectralClass);
          return {
                  ...star,
                  position: real.position,
                  spectralClass: real.spectralClass,
                  magnitude: real.magnitude,
                  isRedGiantAccent: real.isRedGiantAccent,
                  color: spectralColor,
                  // Size by real apparent magnitude: bright anchors (belt, Betelgeuse,
                  // Rigel) dominate; faint members stay small pinpricks so the figure
                  // reads as the real constellation, not a uniform scatter.
                  size: magnitudeSizeFor(real.magnitude, star.size),
                };
        });
      }
