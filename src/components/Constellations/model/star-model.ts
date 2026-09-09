/**
 * star-model.ts — PURE 3D star-field model (no three/r3f imports).
 *
 * Maps a 2D ConstellationState (from contracts-constellations.ts) into the
 * 3D scene primitives the r3f canvas renders: per-star state, position along
 * an organic 3D path, color temperature, size, bloom level, and a staggered
 * twinkle so stars never blink in unison (design lesson: "vary every star").
 *
 * REV 2 (celestial-immersion v1.1.0) — the color language is the REAL stellar
 * spectral arc (OBAFGKM). Per-star color temperature derives from a real
 * spectral class, size from apparent magnitude, and the state ladder maps to
 * a real stellar-evolution arc (protostar → main-sequence → white-hot finish).
 * Red is NOT a general star color (reserved for Kryptonian brand chrome); the
 * sole exception is Betelgeuse (ADR-303, astronomically a red supergiant).
 *
 * Deterministic: identical input → identical output, so tests and SSR-safe
 * HUD chrome (stat counts, labels) can rely on it. No browser APIs here.
 */
import type { ConstellationState } from "@/shared/contracts-constellations";

export type Star3DState = "unlit" | "current" | "ignited" | "complete";

/** Real stellar spectral classes, hottest → coolest (the OBAFGKM arc). */
export type SpectralClass = "O" | "B" | "A" | "F" | "G" | "K" | "M";

/**
 * The real stellar color-temperature arc (design-tokens-3d.css §spectral).
 * Per-star color temperature derives from a star's real spectral class. The
 * finish of the arc is warm luminous — never alert-red.
 */
export const SPECTRAL_ARC: Record<
  SpectralClass,
  { color: string; temperatureK: string; label: string }
> = {
  O: { color: "#9bb0ff", temperatureK: "~30,000 K", label: "Blue" },
  B: { color: "#aac4ff", temperatureK: "~10-30k K", label: "Blue-white" },
  A: { color: "#cad8ff", temperatureK: "~7.5-10k K", label: "White" },
  F: { color: "#f8f7ff", temperatureK: "~6-7.5k K", label: "Yellow-white" },
  G: { color: "#fff4e0", temperatureK: "~5.2-6k K", label: "Yellow (Sun-like)" },
  K: { color: "#ffd2a1", temperatureK: "~3.7-5.2k K", label: "Orange" },
  M: { color: "#ffcc6f", temperatureK: "~2.4-3.7k K", label: "Red-orange" },
};

/**
 * Betelgeuse accuracy accent (ADR-303 exception). A completed asterism's true
 * red-giant members may show their authentic orange-red tint — accuracy on a
 * named star, never a general ignited-state color.
 */
export const BETELGEUSE_ACCENT = "#ff7a3d";

/** Palette mirrored from design-tokens-3d.css (REV 2 state ladder). */
export const STAR_PALETTE: Record<
  Star3DState,
  { color: string; size: number; bloom: number; label: string }
> = {
  unlit: { color: "#6b7a99", size: 0.5, bloom: 0, label: "Unlit" },
  current: { color: "#aac4ff", size: 0.8, bloom: 0.35, label: "Current" },
  ignited: { color: "#fff4e0", size: 1.0, bloom: 0.6, label: "Ignited" },
  complete: { color: "#ffffff", size: 1.2, bloom: 0.9, label: "Complete" },
};

export interface Star3D {
  /** lesson slug — link + tooltip key. */
  slug: string;
  /** display label (lesson title). */
  label: string;
  /** 1-based lesson number (matches lesson ordering). */
  index: number;
  state: Star3DState;
  /** World position along the constellation path. */
  position: [number, number, number];
  color: string;
  size: number;
  bloom: number;
  /** Twinkle timing (seconds) — unique per star. */
  twinkleDuration: number;
  /** Twinkle phase offset (rad) — unique per star. */
  twinklePhase: number;
  /**
   * Real spectral class (OBAFGKM) — drives per-star color temperature in the
   * shader. Populated by buildSeriesStars (deterministic scaffold fallback);
   * the loader may override with authored real-asterism data.
   */
  spectralClass?: SpectralClass;
  /** Real apparent magnitude — drives per-star size/brightness. */
  magnitude?: number;
  /** True for astronomically-red members (e.g. Betelgeuse) — ADR-303. */
  isRedGiantAccent?: boolean;
}

/** Map one lesson's 2D star to its 3D state. */
export function star3DState(
  lit: boolean,
  isCurrent: boolean,
  courseComplete: boolean,
): Star3DState {
  if (courseComplete && lit) return "complete";
  if (lit) return "ignited";
  if (isCurrent) return "current";
  return "unlit";
}

/** Small deterministic string hash (FNV-1a) — stable across runs. */
export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic float in [0,1) from a seed. */
export function seededUnit(seed: string): number {
  return hashString(seed) / 0xffffffff;
}

/** Stable twinkle duration (2.2–5.0s) + phase (0..2π) from a slug. */
export function twinkleFor(slug: string): {
  duration: number;
  phase: number;
} {
  const u = seededUnit(slug);
  return {
    duration: 2.2 + u * 2.8,
    phase: Math.PI * 2 * seededUnit(`${slug}:phase`),
  };
}

const SPECTRAL_ORDER: SpectralClass[] = ["O", "B", "A", "F", "G", "K", "M"];

/**
 * Deterministic spectral class + apparent magnitude from a slug. This is the
 * scaffold fallback so the on-course tracker always has per-star variance; the
 * loader authors REAL asterism data (IAU/Bayer) by overriding these fields.
 */
export function spectralFor(slug: string): {
  spectralClass: SpectralClass;
  magnitude: number;
} {
  const u = seededUnit(slug);
  // Bias toward the common mid-range classes (A–K); O and M are rare. Use the
  // raw hash mod 7 for a well-spread class index across many slugs.
  const idx = hashString(`${slug}:spec`) % 7;
  const spectralClass = SPECTRAL_ORDER[idx];
  // Apparent magnitude: brighter (lower) for hotter classes, with jitter.
  const magnitude = Number((1.5 + u * 3.5).toFixed(2));
  return { spectralClass, magnitude };
}

/** Real spectral color for a class (the OBAFGKM ramp). */
export function spectralColorFor(spectralClass: SpectralClass): string {
  return SPECTRAL_ARC[spectralClass].color;
}

/** Size from apparent magnitude — brighter (lower) → larger. */
export function magnitudeSizeFor(magnitude: number, base = 1.0): number {
  const size = base * (1.6 - Math.min(1.4, Math.max(0.2, magnitude) / 4));
  return Number(size.toFixed(3));
}

/**
 * Build the on-course constellation's 3D star set.
 *
 * Stars are laid out along an organic 3D path (the constellation's "shape").
 * We use a damped sine/tangent walk with per-star deterministic jitter so the
 * shape reads as a constellation (connected figure) rather than a grid, while
 * staying fully deterministic. Depth (z) varies so the camera parallax feels
 * real on hover/fly.
 */
export function buildSeriesStars(input: {
  constellation: ConstellationState;
  /** slug of the current lesson — gets the cyan "you are here" state. */
  currentLessonSlug?: string | null;
}): Star3D[] {
  const { constellation, currentLessonSlug } = input;
  const courseComplete = constellation.complete;

  return constellation.stars.map((star, i) => {
    const state = star3DState(star.lit, star.lessonSlug === currentLessonSlug, courseComplete);
    const p = STAR_PALETTE[state];
    const t = i / Math.max(constellation.stars.length - 1, 1);
    // Horizontal walk along an S-curve with per-star jitter; vertical rise with
    // damped oscillation; depth drifts so the scene has real parallax.
    const jx = (seededUnit(`${star.lessonSlug}:x`) - 0.5) * 1.4;
    const jy = (seededUnit(`${star.lessonSlug}:y`) - 0.5) * 1.0;
    const x = (t - 0.5) * 12 + Math.sin(t * Math.PI * 3) * 0.8 + jx;
    const y = Math.sin(t * Math.PI * 2.5) * 1.1 + jy;
    const z = Math.sin(t * Math.PI * 6) * 1.4 + (seededUnit(`${star.lessonSlug}:z`) - 0.5) * 1.6;
    const tw = twinkleFor(star.lessonSlug);
    const { spectralClass, magnitude } = spectralFor(star.lessonSlug);
    return {
      slug: star.lessonSlug,
      label: star.label,
      index: i + 1,
      state,
      position: [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))],
      color: p.color,
      size: p.size,
      bloom: p.bloom,
      twinkleDuration: tw.duration,
      twinklePhase: tw.phase,
      spectralClass,
      magnitude,
    };
  });
}

/** Fraction of lessons lit, rounded for HUD "N / M stars lit · NN%". */
export function litFraction(stars: Star3D[]): number {
  if (stars.length === 0) return 0;
  return stars.filter((s) => s.state === "ignited" || s.state === "complete").length / stars.length;
}

/** Human label for a star state (tooltip chip / HUD). */
export function stateLabel(state: Star3DState): string {
  switch (state) {
    case "complete":
      return "Complete";
    case "current":
      return "Current";
    case "ignited":
      return "Ignited";
    default:
      return "Unlit";
  }
}
