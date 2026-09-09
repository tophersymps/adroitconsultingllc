/**
 * src/lib/sky.ts — Constellations + Chronicle pure builders (B-18).
 *
 * The one place a ConstellationState, ChronicleEntry[], AchievementStats, and
 * ProfileSky are assembled. Pure + deterministic (injectable inputs, no DB
 * reads here) so every builder is unit-testable without Supabase. Server
 * routes/loaders feed raw rows in; the component layer consumes the contract
 * types in src/shared/contracts-constellations.ts.
 *
 * DOMAIN NOTE (ADR-214/215): star thresholds live in code (deriveRank /
 * RANK_LADDER in completion.ts) — these builders only render the VISUAL state
 * from already-derived data. No rank/streak math happens here.
 */
import type { CompletionEventRow } from "@/shared/contracts-constellations";
import type {
  AchievementStats,
  ChronicleEntry,
  ConstellationStar,
  ConstellationState,
  ProfileSky,
} from "@/shared/contracts-constellations";
import type { Rank } from "@/shared/contracts-constellations";

/** Inputs needed to build one course's constellation (visual star field). */
export interface ConstellationBuildInput {
  /** course_id (DB row) — may be null for content-only series. */
  courseId: string;
  /** Series slug — link + content lookup key. */
  seriesSlug: string;
  /** Course display name (content-derived). */
  name: string;
  /** Tailwind gradient classes (series.json). */
  gradient: string;
  /** ALL planned lesson slugs in canonical order (getSeriesLessonSlugs). */
  lessonSlugs: string[];
  /**
   * The curriculum's final lesson count. Omit and it falls back to the number of
   * slugs supplied, which is what a course that has not declared a final size
   * has always effectively used.
   */
  curriculumLessons?: number;
  /** slug → display label (lesson title). Falls back to the slug. */
  lessonLabels?: Record<string, string>;
  /** The set of completed lesson slugs (from completion events / DB). */
  completedSlugs: ReadonlySet<string>;
  /**
   * True when this course's cert-prep exam has been passed (server-graded
   * `quiz_attempt` best score >= 72). Single exam source across all surfaces.
   */
  examPassed?: boolean;
}

/** Inputs for the Chronicle narrative feed. */
export interface ChronicleBuildInput {
  /** The user's completion_events rows, newest first is fine (we sort). */
  events: CompletionEventRow[];
  /** course_id → course name for label resolution (orphaned → null). */
  courseNameById?: Record<string, string>;
  /** series slug → course name (fallback when course_id is null). */
  seriesNameBySlug?: Record<string, string>;
  /** slug → lesson display label for lesson rows. */
  lessonLabelBySlug?: Record<string, string>;
}

/** Inputs for the profile full-sky aggregate. */
export interface ProfileSkyBuildInput {
  /** Every course's pre-built constellation to render in the sky. */
  constellations: ConstellationState[];
  /** The user's completion events (for streak/rank + chronicle). */
  events: CompletionEventRow[];
  /** course_id → course name for chronicle resolution. */
  courseNameById?: Record<string, string>;
  /** series slug → course name fallback. */
  seriesNameBySlug?: Record<string, string>;
  /** slug → lesson label for chronicle lesson rows. */
  lessonLabelBySlug?: Record<string, string>;
  /** Derived rank (from completion.ts deriveProgress / deriveRank). */
  rank: Rank;
  /** Live streak as-of now. */
  streakDays: number;
  /** Longest streak. */
  longestStreakDays: number;
  /** Distinct courses completed. */
  coursesCompleted: number;
  /** Distinct tracks completed. */
  tracksCompleted: number;
}

/** Build one course's constellation (visual star field, order-preserving). */
export function buildConstellation(
  input: ConstellationBuildInput,
): ConstellationState {
  const { lessonSlugs, completedSlugs } = input;
  const stars: ConstellationStar[] = lessonSlugs.map((slug, index) => ({
    lessonSlug: slug,
    index: index + 1, // 1-based, matching lesson numbers
    label: input.lessonLabels?.[slug] ?? slug,
    lit: completedSlugs.has(slug),
  }));
  const litStars = stars.filter((s) => s.lit).length;
  const examPassed = input.examPassed ?? false;
  return {
    courseId: input.courseId,
    seriesSlug: input.seriesSlug,
    name: input.name,
    gradient: input.gradient,
    totalStars: stars.length,
    // Never below what already exists; a stale declaration must not shrink a course.
    curriculumLessons: Math.max(input.curriculumLessons ?? 0, stars.length),
    litStars,
    // A course is complete when every star is lit (all lessons done) OR when
    // its cert-prep exam has been passed (Chris decision 2026-09-07): the
    // exam pass completes the course even if individual lessons were never
    // ticked, so the constellation reads as done. Individual star `lit` values
    // stay lesson-derived — uncompleted lessons remain visibly open to revisit.
    complete:
      (stars.length > 0 && litStars === stars.length) ||
      (stars.length > 0 && examPassed),
    examPassed,
    stars,
  };
}

/** Date stamp for a completion event (ISO → "YYYY-MM-DD"; raw pass-through). */
export function chronicleDay(iso: string): string {
  return iso.slice(0, 10) || iso;
}

/** Human label for one Chronicle row (copy-deck §7). */
export function chronicleLabel(
  event: CompletionEventRow,
  ctx: { courseName?: string | null; lessonLabel?: string | null },
): string {
  const { courseName, lessonLabel } = ctx;
  switch (event.event_type) {
    case "lesson":
      return lessonLabel ?? courseName ?? "Lesson completed";
    case "course":
      return `${courseName ?? "Course"} completed`;
    case "quiz":
      return `${courseName ?? "Quiz"} · knowledge check`;
    case "exam":
      return `${courseName ?? "Course"} · cert prep exam passed`;
    case "certificate":
      return `${courseName ?? "Course"} · certificate earned`;
    default:
      return "Milestone";
  }
}

/** Build the Chronicle narrative feed (newest first). */
export function buildChronicle(input: ChronicleBuildInput): ChronicleEntry[] {
  const nameById = input.courseNameById ?? {};
  const nameBySlug = input.seriesNameBySlug ?? {};
  const labelBySlug = input.lessonLabelBySlug ?? {};

  const rows = [...input.events].sort(
    (a, b) =>
      new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime(),
  );

  const entries: ChronicleEntry[] = [];
  for (const event of rows) {
    const courseName = event.course_id
      ? nameById[event.course_id] ??
        (event.lesson_slug ? nameBySlug[event.lesson_slug] : null) ??
        null
      : event.lesson_slug
        ? nameBySlug[event.lesson_slug] ?? null
        : null;

    // Score/metadata envelope (quiz/exam) from the server-derived metadata.
    let score: number | null = null;
    if (event.metadata && typeof event.metadata.score === "number") {
      score = event.metadata.score;
    }

    const label = chronicleLabel(event, {
      courseName,
      lessonLabel: event.lesson_slug ? labelBySlug[event.lesson_slug] ?? null : null,
    });

    entries.push({
      id: event.id,
      eventType: event.event_type,
      courseId: event.course_id,
      seriesSlug: event.lesson_slug ?? null,
      courseName,
      label,
      completedAt: event.completed_at,
      score,
    });
  }
  return entries;
}

/** Assemble AchievementStats from already-derived progress numbers. */
export function buildAchievementStats(input: {
  streakDays: number;
  longestStreakDays: number;
  rank: Rank | null;
  coursesCompleted: number;
  tracksCompleted: number;
}): AchievementStats {
  return {
    streakDays: input.streakDays,
    longestStreakDays: input.longestStreakDays,
    rank: input.rank,
    coursesCompleted: input.coursesCompleted,
    tracksCompleted: input.tracksCompleted,
  };
}

/** Assemble the full ProfileSky payload (server loader → client). */
export function buildProfileSky(input: ProfileSkyBuildInput): ProfileSky {
  return {
    stats: buildAchievementStats({
      streakDays: input.streakDays,
      longestStreakDays: input.longestStreakDays,
      rank: input.rank,
      coursesCompleted: input.coursesCompleted,
      tracksCompleted: input.tracksCompleted,
    }),
    constellations: input.constellations,
    chronicle: buildChronicle({
      events: input.events,
      courseNameById: input.courseNameById,
      seriesNameBySlug: input.seriesNameBySlug,
      lessonLabelBySlug: input.lessonLabelBySlug,
    }),
    isGuest: false,
  };
}
