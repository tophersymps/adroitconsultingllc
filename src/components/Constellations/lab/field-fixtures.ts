/**
 * field-fixtures.ts — PURE synthetic lab data (no network, no auth, no three).
 *
 * The lab has to be reviewable without a session, so this module fabricates a
 * `ProfileSky` covering all seven real series slugs at assorted completion
 * levels — two complete, four part-way, one untouched.
 *
 * The production chart (`HubbleFieldLab` → `buildChartFigures`) assigns each
 * course a constellation from `figure-catalog.ts` by `curriculumLessons`. The
 * leftover `labFigure` / `labAsterismFor` path still reads `model/asterism-data.ts`
 * for the unmounted 3D studies; it is not what the chart draws.
 *
 * What is still lab-only is the *progress* — the completion levels below are
 * fabricated, and `labFigure` invents star roles positionally. Neither is a
 * production data source; see `docs/implementation-plan-hubble-field.md` §3.1.
 */
import type {
  AchievementStats,
  ConstellationState,
  ProfileSky,
} from "@/shared/contracts-constellations";
import type { Asterism } from "../model/asterism-data";
import { asterismFor, projectAsterism } from "../model/asterism-data";
import type { SpectralClass } from "../model/star-model";

/**
 * One member star of a course figure.
 *
 * `role` is assigned heuristically here (see `labFigure`) purely so the chart
 * has a hierarchy to draw. It is **not** production truth — real knowledge
 * checks and exams are separate entities, derivable from `getKnowledgeChecks()`
 * and `getCertExam()`. See `docs/implementation-plan-hubble-field.md` §3.1.
 */
export interface FigureStar {
  name: string;
  position: [number, number, number];
  spectralClass: SpectralClass;
  magnitude: number;
  /** Lesson completed → the star burns; otherwise it is a faint marker. */
  lit: boolean;
  /** Whole course complete → lit members run white-hot. */
  complete?: boolean;
  /** ADR-303: the one astronomically-real red giant keeps its true tint. */
  isRedGiantAccent?: boolean;
  isNebula?: boolean;
  /** Lessons stay quiet; checks punch; the exam crowns the figure. */
  role?: "lesson" | "check" | "exam";
}

/*
 * The five figures the lab authored for the unauthored courses (Lyra, Corvus,
 * Delphinus, Corona Borealis, Cygnus) were promoted into `asterism-data.ts` by
 * the Phase 2 port, so `asterismFor` now resolves all seven on its own. This
 * indirection stays because the lab imports it in a dozen places and because a
 * future lab figure should have somewhere to live that is not production.
 */
export function labAsterismFor(seriesSlug: string): Asterism | null {
  return asterismFor(seriesSlug);
}

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

/** Build one course's `ConstellationState`, lit lessons first. */
export function labConstellation(fixture: LabCourseFixture): ConstellationState {
  const figure = labAsterismFor(fixture.seriesSlug);
  const stars = Array.from({ length: fixture.totalStars }, (_, i) => {
    const member = figure?.stars[i % Math.max(figure.stars.length, 1)];
    return {
      lessonSlug: `${fixture.seriesSlug}-lesson-${i + 1}`,
      index: i + 1,
      label: member ? member.name : `Lesson ${i + 1}`,
      lit: i < fixture.litStars,
    };
  });
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

/* ------------------------------------------------------------------ */
/*  Figures for the 3D studies                                         */
/* ------------------------------------------------------------------ */

/** A course as the atlas draws it: projected figure stars + connections. */
export interface LabFigure {
  seriesSlug: string;
  name: string;
  figureName: string;
  litStars: number;
  totalStars: number;
  complete: boolean;
  stars: FigureStar[];
  connections: ReadonlyArray<readonly [number, number]>;
}

/**
 * Project a fixture course into figure stars.
 *
 * Lit members are allocated proportionally to course progress and assigned
 * brightest-first, because a learner's completed lessons should read as the
 * recognizable part of the figure lighting up rather than a random subset.
 *
 * Roles (for the 2D chart hierarchy):
 *   - most members = lesson (quiet pinpricks)
 *   - ~every 4th bright-ish member = knowledge check (brighter)
 *   - the brightest / keystone member = exam (completes the figure when lit)
 */
export function labFigure(fixture: LabCourseFixture, scale = 1): LabFigure {
  const asterism = labAsterismFor(fixture.seriesSlug);
  const projected = asterism ? projectAsterism(asterism, 6.5) : [];
  const progress = fixture.totalStars > 0 ? fixture.litStars / fixture.totalStars : 0;
  const litCount = Math.round(projected.length * progress);
  const complete = fixture.litStars >= fixture.totalStars;

  // Brightest-first lighting order, ties broken deterministically by name.
  const byBright = projected
    .map((s, i) => ({ i, magnitude: s.magnitude, name: s.name }))
    .sort((a, b) => a.magnitude - b.magnitude || (a.name < b.name ? -1 : 1));

  const examIndex = byBright[0]?.i ?? projected.length - 1;
  const checkEvery = Math.max(3, Math.floor(projected.length / 5));
  const checkIndices = new Set<number>();
  byBright.forEach((s, rank) => {
    if (s.i === examIndex) return;
    // Spread checks through the brightness ladder (not the dimmest clutter).
    if (rank > 0 && rank % checkEvery === 0) checkIndices.add(s.i);
  });

  const order = byBright.slice(0, litCount).map((s) => s.i);
  const lit = new Set(order);

  // Exam only lights when the course is fully complete — it finishes the figure.
  if (complete) lit.add(examIndex);
  else lit.delete(examIndex);

  const stars: FigureStar[] = projected.map((s, i) => {
    const role: FigureStar["role"] =
      i === examIndex ? "exam" : checkIndices.has(i) ? "check" : "lesson";
    return {
      name: role === "exam" ? `${s.name} · Exam` : role === "check" ? `${s.name} · Check` : s.name,
      position: [s.position[0] * scale, s.position[1] * scale, s.position[2] * scale],
      spectralClass: s.spectralClass,
      magnitude: s.magnitude,
      lit: lit.has(i),
      complete,
      isRedGiantAccent: s.isRedGiantAccent,
      isNebula: s.isNebula,
      role,
    };
  });

  return {
    seriesSlug: fixture.seriesSlug,
    name: fixture.name,
    figureName: asterism?.name ?? fixture.figureName,
    litStars: fixture.litStars,
    totalStars: fixture.totalStars,
    complete,
    stars,
    connections: asterism?.connections ?? [],
  };
}

/** All seven course figures. */
export function labFigures(scale = 1): LabFigure[] {
  return LAB_COURSES.map((c) => labFigure(c, scale));
}
