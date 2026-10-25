/**
 * field-fixtures.ts — PURE synthetic lab data (no network, no auth, no three).
 *
 * SERVER-ONLY DATA (t_af115dd1 / t_5fdeb918). This module names seven *real*
 * series slugs and display names — three of them unpublished Hermes courses —
 * so it must never be compiled into a client chunk: `.next/static` files are
 * public artifacts, and route gating (`ALLOW_HUBBLE_LAB`) does not gate the
 * artifact, only the route. Doctrine: a client chunk is a published artifact; a
 * per-request RSC payload of an env-gated noindex non-prod route is not.
 *
 * So the lab's page (`src/app/lab/hubble-field/page.tsx`) is `force-dynamic`
 * and passes this sky, plus the full pin registry (`FIGURE_PINS_ALL`), to the
 * client chart as props. The data crosses the wire per request and is never
 * baked into a prerendered `.next/server` html/rsc. `import "server-only"`
 * fails the build if a Client Component ever imports this file, and
 * `server-only-guard.test.ts` pins that import.
 *
 * The `model/asterism-data.ts` import and the `labFigure` / `labFigures` /
 * `FigureStar` path were deleted here: nothing in production ever consumed
 * them (the 3D studies were removed in the Phase 5 cleanup), they were the only
 * route by which the slug-keyed stealth asterisms could reach a client bundle,
 * and the production chart assigns figures by curriculum size from
 * `chart/figure-catalog.ts` instead.
 *
 * What is still lab-only is the *progress* — the completion levels below are
 * fabricated. That is not a production data source; see
 * `docs/implementation-plan-hubble-field.md` §3.1.
 */
import "server-only";

import type {
  AchievementStats,
  ConstellationState,
  ProfileSky,
} from "@/shared/contracts-constellations";

/* ------------------------------------------------------------------ */
/*  Course fixtures                                                    */
/* ------------------------------------------------------------------ */

/** One fixture course: real slug, real name, assorted progress. */
export interface LabCourseFixture {
  seriesSlug: string;
  name: string;
  /** Constellation the course draws. */
  figureName: string;
  totalStars: number;
  litStars: number;
  /**
   * The curriculum's final size, where the fixture wants to exercise a course
   * still being written. Defaults to `totalStars` — a finished curriculum.
   */
  curriculumLessons?: number;
}

/**
 * Seven real series slugs at deliberately uneven completion, so every visual
 * state is on screen at once: two complete, four in progress at different
 * depths, one never started.
 *
 * `figureName` is advisory. The chart assigns constellations by *size* now, so
 * what a course actually draws comes from `assignFigures` against
 * `curriculumLessons` — this field only records what the lab was authored
 * against.
 *
 * Two courses carry a `curriculumLessons` above their published count, because a
 * curriculum still being written is the normal state here and the lab should show
 * what that looks like: a figure sized for the finished course, mostly dark.
 */
export const LAB_COURSES: readonly LabCourseFixture[] = [
  {
    seriesSlug: "salesforce-architect",
    name: "Salesforce System Architect Primer",
    figureName: "Orion",
    totalStars: 29,
    litStars: 29,
  },
  {
    seriesSlug: "agentic-ai",
    name: "Agentic AI Implementation Path",
    figureName: "Cassiopeia",
    totalStars: 5,
    litStars: 3,
    // Three of five published, of a planned forty — the "just launched" case.
    curriculumLessons: 40,
  },
  {
    seriesSlug: "omni-studio-cert",
    name: "OmniStudio Developer Certification",
    figureName: "Lyra",
    totalStars: 12,
    litStars: 7,
  },
  {
    seriesSlug: "hermes-consultant",
    name: "Hermes Agent Consultant",
    figureName: "Corvus",
    totalStars: 10,
    litStars: 10,
  },
  {
    seriesSlug: "hermes-consultant-intermediate",
    name: "Hermes Agent Consultant — Intermediate",
    figureName: "Delphinus",
    totalStars: 10,
    litStars: 4,
  },
  {
    seriesSlug: "hermes-consultant-advanced",
    name: "Hermes Agent Consultant — Advanced",
    figureName: "Corona Borealis",
    totalStars: 12,
    litStars: 0,
    // Halfway written, nothing started.
    curriculumLessons: 20,
  },
  {
    seriesSlug: "ai-at-work",
    name: "AI at Work",
    figureName: "Cygnus",
    totalStars: 8,
    litStars: 1,
  },
];

/** Gradients mirror the real series.json values (2D fallback parity). */
const GRADIENTS: Record<string, string> = {
  "salesforce-architect": "from-sky to-blue-600",
  "agentic-ai": "from-amber to-yellow-600",
  "omni-studio-cert": "from-red to-rose-600",
  "hermes-consultant": "from-teal to-emerald-600",
  "hermes-consultant-intermediate": "from-teal to-emerald-600",
  "hermes-consultant-advanced": "from-teal to-emerald-600",
  "ai-at-work": "from-fuchsia to-purple-600",
};

/**
 * Build one course's `ConstellationState`, lit lessons first.
 *
 * Star labels are generic lesson labels: the chart renders the *figure's* star
 * names (from `figure-catalog.ts`), not these, and the slug-keyed asterism
 * table that used to supply them is no longer imported here.
 */
export function labConstellation(fixture: LabCourseFixture): ConstellationState {
  const stars = Array.from({ length: fixture.totalStars }, (_, i) => ({
    lessonSlug: `${fixture.seriesSlug}-lesson-${i + 1}`,
    index: i + 1,
    label: `Lesson ${i + 1}`,
    lit: i < fixture.litStars,
  }));
  return {
    courseId: `lab-${fixture.seriesSlug}`,
    seriesSlug: fixture.seriesSlug,
    name: fixture.name,
    gradient: GRADIENTS[fixture.seriesSlug] ?? "from-sky to-blue-600",
    totalStars: fixture.totalStars,
    curriculumLessons: fixture.curriculumLessons ?? fixture.totalStars,
    litStars: fixture.litStars,
    complete: fixture.litStars >= fixture.totalStars,
    stars,
  };
}

/** Lab `AchievementStats` — mid-ladder, so illumination has room both ways. */
const LAB_STATS: AchievementStats = {
  streakDays: 6,
  longestStreakDays: 23,
  rank: {
    id: "explorer",
    name: "Explorer",
    description: "Half the sky answers to you.",
    index: 2,
    nextProgressPct: 48,
  },
  coursesCompleted: 2,
  tracksCompleted: 0,
};

/**
 * The synthetic `ProfileSky` the lab renders. Chronicle is empty on purpose —
 * the lab reviews the field, and a feed would be page chrome.
 */
export function labProfileSky(): ProfileSky {
  return {
    stats: LAB_STATS,
    constellations: LAB_COURSES.map(labConstellation),
    chronicle: [],
    isGuest: false,
  };
}
