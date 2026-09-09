/**
 * chart.ts — production data → star-chart figures.
 *
 * Pure: no React, no DOM, no fetching. The renderer takes chart-ready figures
 * and nothing else, so everything that decides *what* the chart claims about
 * someone's progress is unit-testable here.
 *
 * ## Lessons light stars
 *
 * A course is drawn as a constellation sized to its curriculum, so a lesson maps
 * to a star: finish lesson 4, star 4 lights. The size that decides which
 * constellation a course gets is `ConstellationState.curriculumLessons` — the
 * *final* lesson count, declared in `series.json` — not the count published so
 * far. Lessons land daily, and a figure that reshuffled every time one shipped
 * would be worthless as a progress surface.
 *
 * Where a course has more lessons than the largest figure has stars (no real
 * constellation outline runs to thirty-odd stars), lessons deal round-robin so
 * each star stands for a small group and lights when that group is done. See
 * `lessonsPerStar`.
 *
 * ## Two roles, not three
 *
 * Production carries `ConstellationStar.lit` per lesson and `complete` per
 * course, and nothing maps a quiz or an exam to a *position* in a series. The lab
 * faked that by making the brightest star the exam and every nth star a knowledge
 * check, which is fine for a lab and is not shippable as a claim about what
 * someone has passed. So: lessons are the star line, the exam is a single
 * crowning node, and the knowledge-check diamonds are dropped until the catalog
 * exposes where quizzes sit. See `docs/implementation-plan-hubble-field.md` §3.1.
 */
import type {
  ChronicleEntry,
  ConstellationState,
  ProfileSky,
} from "@/shared/contracts-constellations";
import type { SpectralClass } from "@/components/Constellations/model/star-model";
import {
  projectFigure,
  type ConstellationFigure,
} from "@/components/Constellations/chart/figure-catalog";
import {
  assignFigures,
  lessonsPerStar,
} from "@/components/Constellations/chart/figure-assignment";

/** One drawn member of a course figure. */
export interface ChartStar {
  name: string;
  position: [number, number, number];
  spectralClass: SpectralClass;
  magnitude: number;
  /** True when every lesson this star stands for is complete. */
  lit: boolean;
  /**
   * The 1-based lesson numbers this star stands for.
   *
   * Usually one. More than one only when the course has more lessons than the
   * figure has stars, and empty when it has fewer — those stars can never light,
   * which is honest: the course has no lessons to earn them.
   */
  lessons: number[];
  isRedGiantAccent?: boolean;
  isNebula?: boolean;
  /** v1 is two roles. `check` is deliberately absent — see the file header. */
  role: "lesson" | "exam";
}

/** A course, ready to draw. */
export interface ChartFigure {
  seriesSlug: string;
  /** Course display name. */
  name: string;
  /** Constellation the course draws, or null when none could be assigned. */
  figureName: string | null;
  litStars: number;
  totalStars: number;
  /** The curriculum's final lesson count — what sized the figure. */
  curriculumLessons: number;
  complete: boolean;
  /** True when an `exam` completion event exists for this course. */
  examPassed: boolean;
  /** Empty when no figure was assigned — renders label-only. */
  stars: ChartStar[];
  connections: ReadonlyArray<readonly [number, number]>;
  /**
   * The fine-grained path between main stars. Lessons (1..curriculum, in
   * lesson order) are distributed across the figure's connecting segments
   * proportionally to each segment's projected length, so the learner lights
   * the PATH toward the next main star rather than waiting for a whole
   * round-robin bucket to finish. Each segment reports which lessons it
   * carries and how many of them are done — the renderer shows sparse
   * segments as individual nodes and dense ones as a filling rail.
   */
  segments: ChartSegment[];
}

/**
 * A chunk of the course's lessons mapped onto one connecting segment between
 * two main stars.
 */
export interface ChartSegment {
  /** Indices into `stars` — the two main stars this path runs between. */
  a: number;
  b: number;
  /** 1-based lesson numbers carried by this segment, in curriculum order. */
  lessons: number[];
  /** How many of `lessons` are completed. */
  done: number;
}

/** Fraction of the course finished, 0-1. Guards a zero-lesson course. */
export function figureProgress(figure: {
  litStars: number;
  totalStars: number;
}): number {
  if (figure.totalStars <= 0) return 0;
  return Math.min(1, Math.max(0, figure.litStars / figure.totalStars));
}

/**
 * Series slugs with a passed cert exam, read off the chronicle.
 *
 * An `exam` event is only written on a pass, so its presence is the pass. This
 * is the one piece of exam truth `ProfileSky` already carries; without it the
 * crowning node can only follow `complete`.
 */
export function examPassedSlugs(
  chronicle: readonly ChronicleEntry[],
): Set<string> {
  const out = new Set<string>();
  for (const e of chronicle) {
    if (e.eventType === "exam" && e.seriesSlug) out.add(e.seriesSlug);
  }
  return out;
}

/**
 * Which member crowns the figure.
 *
 * The brightest member, ties broken by name so the choice is stable across runs.
 * This is a *display* choice about where to put the course's exam node — it is
 * not asserting that this star is the exam question.
 */
function crownIndex(stars: ReadonlyArray<{ magnitude: number; name: string }>): number {
  if (stars.length === 0) return -1;
  return stars
    .map((s, i) => ({ i, magnitude: s.magnitude, name: s.name }))
    .sort((a, b) => a.magnitude - b.magnitude || (a.name < b.name ? -1 : 1))[0]!.i;
}

/** The set of 1-based lesson numbers completed, from per-lesson progress. */
function completedLessonNumbers(constellation: ConstellationState): Set<number> {
  const out = new Set<number>();
  for (const [i, star] of constellation.stars.entries()) {
    // `index` is 1-based and authoritative; fall back to array order.
    if (star.lit) out.add(star.index > 0 ? star.index : i + 1);
  }
  return out;
}

export interface BuildChartFigureOptions {
  /** The constellation this course draws. Null → a label-only figure. */
  figure?: ConstellationFigure | null;
  examPassed?: boolean;
}

/** Build one course's chart figure from production constellation state. */
export function buildChartFigure(
  constellation: ConstellationState,
  options: BuildChartFigureOptions = {},
): ChartFigure {
  const { seriesSlug, name, litStars, totalStars, complete } = constellation;
  const curriculumLessons = Math.max(constellation.curriculumLessons ?? 0, totalStars);
  // Exam crown uses the server-authoritative value carried on the constellation
  // (single source), overridable by explicit callers (tests/lab).
  const examPassed = options.examPassed ?? constellation.examPassed ?? false;

  /*
   * Callers that hand over a single course (the on-course tracker, tests) get
   * size matching for free rather than having to run the assigner themselves.
   */
  const figure =
    options.figure === undefined
      ? (assignFigures([{ seriesSlug, curriculumLessons }]).get(seriesSlug) ?? null)
      : options.figure;

  const base = {
    seriesSlug,
    name,
    litStars,
    totalStars,
    curriculumLessons,
    complete,
    examPassed,
  };

  if (!figure) {
    return { ...base, figureName: null, stars: [], connections: [], segments: [] };
  }

  const projected = projectFigure(figure);
  const crown = crownIndex(projected);

  /*
   * Buckets are sized against the curriculum, not against what is published, so
   * a star's meaning does not change when a lesson ships. Lesson 12 belongs to
   * the same star on the day the course launches and the day it finishes.
   */
  const buckets = lessonsPerStar(curriculumLessons, projected.length);
  const done = completedLessonNumbers(constellation);

  const stars: ChartStar[] = projected.map((s, i) => {
    const lessons = buckets[i] ?? [];
    const isCrown = i === crown;
    // A star burns once every lesson it stands for is done. No lessons → never.
    const earned = lessons.length > 0 && lessons.every((n) => done.has(n));
    return {
      name: isCrown ? `${s.name} · Final exam` : s.name,
      position: s.position,
      spectralClass: s.spectralClass,
      magnitude: s.magnitude,
      // The crown closes the figure, so it answers to the course, not a lesson.
      lit: isCrown ? complete || examPassed : earned,
      lessons,
      ...(s.isRedGiantAccent ? { isRedGiantAccent: true } : {}),
      ...(s.isNebula ? { isNebula: true } : {}),
      role: isCrown ? ("exam" as const) : ("lesson" as const),
    };
  });

  return {
    ...base,
    figureName: figure.name,
    stars,
    connections: figure.connections,
    segments: buildSegments(figure.connections, projected, curriculumLessons, done),
  };
}

/**
 * Distribute a course's lessons (1..curriculum, in lesson order) across the
 * figure's connecting segments, proportional to each segment's projected
 * length, so the learner lights the path toward the next main star rather than
 * waiting for a whole round-robin bucket.
 *
 * Long segments get more lessons than short ones (a long crossing reads as
 * "more path to travel"); lessons are kept contiguous per segment so the rail
 * fills left-to-right along the course. A segment where every lesson is done is
 * fully lit; partial completion lights a fraction (the renderer shows dense
 * segments as a filling rail).
 *
 * Deterministic — the same figure + curriculum always yields the same layout.
 * When the figure has fewer segments than lessons, some segments carry several
 * lessons; when it has more, tail lessons simply have no segment (honest).
 */
export function buildSegments(
  connections: ReadonlyArray<readonly [number, number]>,
  projected: ReadonlyArray<{ position: [number, number, number] }>,
  curriculumLessons: number,
  done: ReadonlySet<number>,
): ChartSegment[] {
  if (curriculumLessons < 1 || connections.length === 0) return [];

  // Length of each segment in projected space.
  const lengths = connections.map(([a, b]) => {
    const [ax, ay] = projected[a]!.position;
    const [bx, by] = projected[b]!.position;
    return Math.hypot(bx - ax, by - ay);
  });
  const totalLen = lengths.reduce((s, l) => s + l, 0);
  if (totalLen <= 0) {
    // Degenerate (collapsed figure) — split evenly instead.
    return distributeEvenly(connections, projected, curriculumLessons, done);
  }

  // Assign an integer lesson count per segment proportional to length, keeping
  // the total exactly curriculumLessons via largest-remainder apportionment.
  const raw = lengths.map((l) => (l / totalLen) * curriculumLessons);
  const counts = raw.map((r) => Math.floor(r));
  const remaining = curriculumLessons - counts.reduce((s, c) => s + c, 0);
  const order = raw
    .map((r, i) => ({ r, i }))
    .sort((x, y) => y.r - Math.floor(y.r) - (x.r - Math.floor(x.r)))
    .map((x) => x.i);
  for (let k = 0; k < remaining && k < order.length; k++) counts[order[k]!]!++;

  // Walk lessons onto segments in connection order (contiguous per segment).
  const segments: ChartSegment[] = [];
  let cursor = 1;
  for (let i = 0; i < connections.length; i++) {
    const n = counts[i]!;
    if (n < 1) continue;
    const lessons = Array.from({ length: n }, (_, k) => cursor + k);
    cursor += n;
    segments.push({
      a: connections[i]![0],
      b: connections[i]![1],
      lessons,
      done: lessons.filter((l) => done.has(l)).length,
    });
  }
  return segments;
}

/** Fallback when a figure collapses (zero-length segments): split evenly. */
function distributeEvenly(
  connections: ReadonlyArray<readonly [number, number]>,
  projected: ReadonlyArray<{ position: [number, number, number] }>,
  curriculumLessons: number,
  done: ReadonlySet<number>,
): ChartSegment[] {
  const have = Math.min(connections.length, curriculumLessons);
  const base = Math.floor(curriculumLessons / Math.max(have, 1));
  const extra = curriculumLessons - base * have;
  const segments: ChartSegment[] = [];
  let cursor = 1;
  for (let i = 0; i < have; i++) {
    const n = base + (i < extra ? 1 : 0);
    const lessons = Array.from({ length: n }, (_, k) => cursor + k);
    cursor += n;
    segments.push({
      a: connections[i]![0],
      b: connections[i]![1],
      lessons,
      done: lessons.filter((l) => done.has(l)).length,
    });
  }
  return segments;
}

/**
 * Build every course's figure for the profile sky.
 *
 * Figures are assigned across the whole set at once, because no two courses may
 * draw the same constellation — that is a decision about the sky, not about a
 * course, so it cannot be made one course at a time.
 */
export function buildChartFigures(sky: ProfileSky): ChartFigure[] {
  const assignments = assignFigures(
    sky.constellations.map((c) => ({
      seriesSlug: c.seriesSlug,
      curriculumLessons: Math.max(c.curriculumLessons ?? 0, c.totalStars),
    })),
  );

  return sky.constellations.map((c) =>
    buildChartFigure(c, {
      figure: assignments.get(c.seriesSlug) ?? null,
      examPassed: c.examPassed,
    }),
  );
}
