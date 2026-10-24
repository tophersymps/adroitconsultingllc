/**
 * figure-assignment.ts — which constellation a course is drawn as.
 *
 * Assignment is by *size*: a course should get a figure with about as many stars
 * as the course has lessons, so a lesson can light a star. The number used is
 * the curriculum's final lesson count, never the count published so far — see
 * `ConstellationState.curriculumLessons`. Courses grow daily, and a figure that
 * changed whenever a lesson shipped would be useless as a progress surface.
 *
 * Pure and deterministic: the same catalog always produces the same sky.
 */
import {
  CONSTELLATION_FIGURES,
  LARGEST_FIGURE,
  figureByName,
  type ConstellationFigure,
} from "./figure-catalog";

export interface AssignableCourse {
  seriesSlug: string;
  /** The curriculum's final lesson count. */
  curriculumLessons: number;
}

/**
 * Courses pinned to a specific constellation, overriding size matching.
 *
 * **This map is the PUBLISHED projection, not the editorial registry.** It
 * ships in a client chunk (`/atlas/[series]` and `/profile` both draw charts in
 * the browser), so it may only name series the site already names publicly —
 * exactly the four in `PUBLICLY_LAUNCHED_SERIES`. The full twelve-course
 * registry lives in `figure-pins.server.ts` (`FIGURE_PINS_ALL`, behind
 * `import "server-only"`); `chart.test.ts` asserts this map deep-equals
 * `publicPins()`, so a stealth pin cannot be added here and a launch cannot
 * forget its pin. Doctrine (t_af115dd1 §1): a client chunk is a published
 * artifact; a per-request RSC payload of an env-gated noindex non-prod route is
 * not.
 *
 * For the published series, pinning is the **single source of truth** for
 * "which constellation a course draws," and it is exclusive: a pinned figure is
 * claimed and no other course can take it. This is what makes the on-course
 * tracker at `/atlas/[series]` and the whole-sky profile always agree on a
 * published course's constellation — before pins, the course page ran an
 * *isolated* size-match (`buildChartFigure` on one course) that ignored the
 * rest of the sky, so a course could quietly draw a figure the profile had
 * already given to a different course. With the published courses pinned, both
 * surfaces resolve to the same figure.
 *
 * **Unpublished series have no public figure contract.** They are not in this
 * map at all, so they resolve by size match until they launch — which means a
 * non-public series rendered outside the lab (an admin viewing a pending
 * `/atlas/[series]`, a tester's own `/profile`) may size-match to a different
 * constellation than it will own once launched, and its course page and profile
 * may disagree with each other. That is the pre-Phase-4 behaviour, restored
 * deliberately and only for non-public series (accepted residual, t_af115dd1
 * §2 / CHANGELOG). Public series are unaffected: pins are applied before size
 * matching. Server-side callers that need the full contract (the lab, the
 * constellation pool, tests) pass `FIGURE_PINS_ALL` through the `pins` seam.
 */
export const FIGURE_PINS: Readonly<Record<string, string>> = {
  "salesforce-architect": "Centaurus",
  "agentic-ai": "Cetus",
  "omni-studio-cert": "Hydra",
  "ai-at-work": "Virgo",
};

/** Deterministic processing order: biggest course first, then by slug. */
function byDescendingSize(a: AssignableCourse, b: AssignableCourse): number {
  return (
    b.curriculumLessons - a.curriculumLessons ||
    (a.seriesSlug < b.seriesSlug ? -1 : 1)
  );
}

/**
 * Assign a figure to every course, by size.
 *
 * Three passes, in priority order:
 *
 * 1. **Pins.** Stated intent, so they cannot lose a figure to matching.
 * 2. **Exact fits.** Any course whose lesson count equals a figure's star count
 *    takes it. This pass exists because a single largest-first sweep gives it
 *    away: a 19-lesson course with no exact match would grab the 10-star figure
 *    as its nearest option and leave the 10-lesson course with a 9, breaking the
 *    one-star-per-lesson mapping for the course that could actually have had it.
 * 3. **Everything else**, largest course first, each taking the closest figure
 *    still unclaimed. Largest-first because the big courses are the ones with no
 *    exact match, so they should get first refusal on the big figures rather than
 *    being left with what a 5-lesson course did not want.
 *
 * Ties in pass 3 break toward the *larger* figure and then by name: a 12-lesson
 * course offered an 11 and a 13 takes the 13, since a figure with room to spare
 * reads better than one that has to double up.
 *
 * No two courses share a figure. Once the catalog is exhausted, later courses get
 * null and render as label-and-progress only, which `buildChartFigure` already
 * handles; the fix then is to author more figures, not to double-book.
 *
 * **Stability caveat.** Because the pool is shared, adding a course can take a
 * figure another course was using. That is inherent to automatic assignment and
 * is why `FIGURE_PINS` exists. It is deterministic either way: the same set of
 * courses always yields the same mapping.
 */
export function assignFigures(
  courses: readonly AssignableCourse[],
  pins: Readonly<Record<string, string>> = FIGURE_PINS,
): Map<string, ConstellationFigure> {
  const out = new Map<string, ConstellationFigure>();
  const claimed = new Set<string>();

  const take = (seriesSlug: string, figure: ConstellationFigure) => {
    out.set(seriesSlug, figure);
    claimed.add(figure.name);
  };

  // 1. Pins.
  for (const course of [...courses].sort(byDescendingSize)) {
    const pinned = pins[course.seriesSlug];
    if (!pinned) continue;
    const figure = figureByName(pinned);
    if (!figure || claimed.has(figure.name)) continue;
    take(course.seriesSlug, figure);
  }

  // 2. Exact fits — one star per lesson is the ideal, so protect it.
  for (const course of [...courses].sort(byDescendingSize)) {
    if (out.has(course.seriesSlug)) continue;
    const exact = CONSTELLATION_FIGURES.filter(
      (f) => !claimed.has(f.name) && f.stars.length === course.curriculumLessons,
    ).sort((a, b) => (a.name < b.name ? -1 : 1))[0];
    if (exact) take(course.seriesSlug, exact);
  }

  // 3. Closest remaining.
  for (const course of [...courses].sort(byDescendingSize)) {
    if (out.has(course.seriesSlug)) continue;
    const target = Math.max(1, course.curriculumLessons);
    let best: ConstellationFigure | null = null;
    let bestDistance = Infinity;

    for (const figure of CONSTELLATION_FIGURES) {
      if (claimed.has(figure.name)) continue;
      const distance = Math.abs(figure.stars.length - target);
      const better =
        best === null ||
        distance < bestDistance ||
        (distance === bestDistance &&
          (figure.stars.length > best.stars.length ||
            (figure.stars.length === best.stars.length && figure.name < best.name)));
      if (better) {
        best = figure;
        bestDistance = distance;
      }
    }

    if (best) take(course.seriesSlug, best);
  }

  return out;
}

/**
 * How a course's lessons map onto its figure's stars.
 *
 * Returns, per star, the 1-based lesson numbers it stands for.
 *
 * With as many stars as lessons this is 1:1 — lesson 4 is star 4. When a course
 * has more lessons than the largest figure has stars (no real constellation
 * outline runs to thirty-odd stars), lessons deal round-robin onto the figure so
 * each star stands for a small group, and the star lights when that whole group
 * is done. Dealing round-robin rather than in contiguous blocks keeps the figure
 * filling evenly instead of lighting one limb at a time.
 *
 * Fewer lessons than stars leaves the tail of the figure unassigned; those stars
 * can never light, which is honest — the course does not have the lessons to earn
 * them. `assignFigures` avoids this where the catalog allows.
 */
export function lessonsPerStar(lessonCount: number, starCount: number): number[][] {
  if (starCount <= 0) return [];
  const buckets: number[][] = Array.from({ length: starCount }, () => []);
  for (let lesson = 1; lesson <= lessonCount; lesson++) {
    buckets[(lesson - 1) % starCount]!.push(lesson);
  }
  return buckets;
}

/** True when the catalog can give this course one star per lesson. */
export function hasExactFit(curriculumLessons: number): boolean {
  return CONSTELLATION_FIGURES.some((f) => f.stars.length === curriculumLessons);
}

export { LARGEST_FIGURE };
