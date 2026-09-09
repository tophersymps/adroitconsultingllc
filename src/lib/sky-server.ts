/**
 * src/lib/sky-server.ts — server loaders for the Constellations + Chronicle
 * surfaces (B-18). Reads completion_events through the RLS cookie-bound client
 * (scoped to owner), derives rank/streak via completion.ts, and assembles the
 * ProfileSky / AchievementStats payloads via the pure builders in sky.ts.
 *
 * These loaders are called from server components and API routes ONLY — they
 * touch the HttpOnly-session Supabase client, so nothing here is client-safe.
 */
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { deriveProgress } from "@/lib/completion";
import { getCompletedLessonSlugs } from "@/lib/completion";
import { buildAchievementStats, buildConstellation, buildProfileSky } from "@/lib/sky";
import { getCatalogForUserV2, toLearnHubCards } from "@/lib/catalog";
import { getLessonsForSeries, getSeriesBySlug } from "@/lib/learn";
import { getSeriesLessonSlugs } from "@/lib/certificate";
import { getCertExam, scoreQuizAttemptRows } from "@/lib/quiz";
import { CERT_EXAM_PASS_PCT } from "@/lib/certificate";
import type {
  AchievementStats,
  CompletionEventRow,
  ProfileSky,
} from "@/shared/contracts-constellations";
import type { LearnCardSeries } from "@/data/types";

/** Load all of a user's completion events (best-effort, never throws). */
export async function getCompletionEvents(
  userId: string,
): Promise<CompletionEventRow[]> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("completion_events")
      .select("*")
      .eq("user_id", userId);
    if (error) throw error;
    return (data ?? []) as CompletionEventRow[];
  } catch (err) {
    console.error("[sky] getCompletionEvents", err);
    return [];
  }
}

/** course_id → track slug map (for tracksCompleted derivation). */
async function getCourseTracks(): Promise<Record<string, string>> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("courses")
      .select("id, track")
      .not("track", "is", null);
    if (error) throw error;
    const map: Record<string, string> = {};
    for (const r of data ?? []) {
      if (r.track) map[r.id as string] = r.track as string;
    }
    return map;
  } catch {
    return {};
  }
}

/** All series slugs (best-effort, content-derived). */
function getAllSeriesSlugs(): string[] {
  return ["salesforce-architect", "agentic-ai", "omni-studio-cert", "ai-at-work"].filter(
    (s) => Boolean(getSeriesBySlug(s)),
  );
}

/**
 * Which of the courses' cert-prep exams the user has PASSED, derived server-side
 * from the graded `quiz_attempt` rows (single source of truth for the crown).
 *
 * Returns a Set of series slugs where the best exam score is >= 72. This is the
 * SAME derivation the certificate page uses (server-graded quiz_attempt, full
 * canonical coverage — never the client-writable quiz_run history). Both the
 * profile sky and the on-course tracker read this, so the exam crown is
 * identical everywhere.
 */
export async function loadExamPassedBySeries(
  userId: string,
  seriesSlugs: string[],
): Promise<Set<string>> {
  const withExam = seriesSlugs.filter((s) => getCertExam(s) !== null);
  if (withExam.length === 0) return new Set();

  const quizNames = withExam.map((s) => `${s}:exam`);
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("quiz_attempt")
      .select("quiz_name, question_index, is_correct")
      .eq("user_id", userId)
      .in("quiz_name", quizNames);
    if (error) throw error;

    const rows = (data ?? []) as {
      quiz_name: string;
      question_index: number;
      is_correct: boolean;
    }[];

    const passed = new Set<string>();
    for (const s of withExam) {
      const exam = getCertExam(s);
      const canonical = exam?.questions.length;
      const attempts = rows.filter((r) => r.quiz_name === `${s}:exam`);
      const scored = scoreQuizAttemptRows(attempts, canonical);
      if (scored && scored.score >= CERT_EXAM_PASS_PCT) passed.add(s);
    }
    return passed;
  } catch (err) {
    console.error("[sky] loadExamPassedBySeries", err);
    return new Set();
  }
}

/**
 * Lesson labels (slug → title) for all series (best-effort). */
export function getLessonLabelMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const slug of getAllSeriesSlugs()) {
    for (const lesson of getLessonsForSeries(slug)) {
      map[lesson.slug] = lesson.title;
    }
  }
  return map;
}

/**
 * Build ONE series' constellation for the outline / certificate surfaces.
 * Uses the series' PLANNED lesson set in canonical lesson-number order —
 * published lessons first (getLessonsForSeries), then the generator's
 * per-lesson question files (getSeriesLessonSlugs) as the fallback for
 * series whose content lives in a questions/ dir. `completedSlugs` comes from
 * the caller (lesson_completion rows for the user). Best-effort: an empty
 * series returns null so callers can fall back to no-constellation.
 */
export async function loadSeriesConstellation(input: {
  seriesSlug: string;
  name: string;
  gradient: string;
  courseId: string;
  completedSlugs?: ReadonlySet<string>;
  examPassed?: boolean;
}): Promise<ReturnType<typeof buildConstellation> | null> {
  // Canonical, ordered star set: the series' published lessons. Falls back to
  // the generator's planned question-file set (unpublished-yet lessons still
  // count toward the star field). An empty set → no constellation.
  const published = getLessonsForSeries(input.seriesSlug).map((l) => l.slug);
  const slugs = published.length > 0 ? published : getSeriesLessonSlugs(input.seriesSlug);
  if (slugs.length === 0) return null;
  const lessonLabels = getLessonLabelMap();
  return buildConstellation({
    courseId: input.courseId,
    seriesSlug: input.seriesSlug,
    name: input.name,
    gradient: input.gradient,
    lessonSlugs: slugs,
    curriculumLessons: getSeriesBySlug(input.seriesSlug)?.curriculumLessons,
    lessonLabels,
    completedSlugs: input.completedSlugs ?? new Set<string>(),
    examPassed: input.examPassed ?? false,
  });
}

/** Course id ↔ series slug ↔ name maps for chronicle label resolution. */
export async function getSkyCourseMaps(): Promise<{
  courseNameById: Record<string, string>;
  seriesNameBySlug: Record<string, string>;
  courseIdBySlug: Record<string, string>;
}> {
  const courseNameById: Record<string, string> = {};
  const seriesNameBySlug: Record<string, string> = {};
  const courseIdBySlug: Record<string, string> = {};
  for (const slug of getAllSeriesSlugs()) {
    const s = getSeriesBySlug(slug);
    if (s) seriesNameBySlug[slug] = s.name;
  }
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("courses")
      .select("id, series_slug, name");
    if (error) throw error;
    for (const r of data ?? []) {
      const id = r.id as string;
      const slug = (r.series_slug as string) ?? id;
      const name = (r.name as string) ?? slug;
      courseNameById[id] = name;
      if (r.series_slug) seriesNameBySlug[slug] = name;
      courseIdBySlug[slug] = id;
    }
  } catch {
    // maps stay content-only — chronicle falls back to event fields
  }
  return { courseNameById, seriesNameBySlug, courseIdBySlug };
}

/**
 * GET /api/progress/achievement payload — rank + streak + course counts for
 * the P1 pop + hub. Guests return an empty (guest) stats block.
 */
export async function loadAchievementStats(
  userId: string | null,
): Promise<AchievementStats> {
  if (!userId) {
    return buildAchievementStats({
      streakDays: 0,
      longestStreakDays: 0,
      rank: null,
      coursesCompleted: 0,
      tracksCompleted: 0,
    });
  }
  const events = await getCompletionEvents(userId);
  const courseTracks = await getCourseTracks();
  const progress = deriveProgress({ events, courseTracks, now: new Date().toISOString() });
  return buildAchievementStats({
    streakDays: progress.streakDays,
    longestStreakDays: progress.longestStreakDays,
    rank: progress.rank,
    coursesCompleted: progress.coursesCompleted,
    tracksCompleted: progress.tracksCompleted,
  });
}

/**
 * Full ProfileSky payload for the /profile full-sky hero + chronicle.
 * Server loader — derives from completion events + the visible catalog.
 * `isGuest` is set by the caller (guest lock is handled by the page).
 */
export async function loadProfileSky(
  userId: string,
): Promise<ProfileSky> {
  const events = await getCompletionEvents(userId);
  const courseTracks = await getCourseTracks();
  const progress = deriveProgress({ events, courseTracks, now: new Date().toISOString() });
  const maps = await getSkyCourseMaps();
  const lessonLabels = getLessonLabelMap();

  // Constellation lighting source of truth (deep-sky v1.2.0): the CURRENT set
  // of completed lessons comes from lesson_completion (getCompletedLessonSlugs)
  // — the SAME source the on-course tracker /learn/[series] reads. completion
  // events stay for rank/streak/chronicle below but are NOT used to light
  // constellations, so an unmark (which deletes the lesson_completion row but
  // keeps the immutable event) reflects on BOTH surfaces identically.
  const completedSlugs = await getCompletedLessonSlugs(userId);

  // Constellation build inputs from the visible catalog (only courses with
  // a planned lesson set render a star field).
  let cards: LearnCardSeries[] = [];
  try {
    const catalog = await getCatalogForUserV2(userId);
    cards = toLearnHubCards(catalog.courses);
  } catch {
    // catalog unreachable → empty constellation set
  }

  // Exam crowns: single server-graded source (quiz_attempt), not the chronicle.
  const examPassedBySeries = await loadExamPassedBySeries(
    userId,
    cards.map((c) => c.slug),
  );

  const constellations = cards
    .map((card) => {
      const published = getLessonsForSeries(card.slug).map((l) => l.slug);
      const slugs =
        published.length > 0 ? published : getSeriesLessonSlugs(card.slug);
      if (slugs.length === 0) return null;
      return buildConstellation({
        courseId: maps.courseIdBySlug[card.slug] ?? card.slug,
        seriesSlug: card.slug,
        name: card.name,
        gradient: card.gradient,
        lessonSlugs: slugs,
        curriculumLessons: getSeriesBySlug(card.slug)?.curriculumLessons,
        lessonLabels: lessonLabels,
        completedSlugs,
        examPassed: examPassedBySeries.has(card.slug),
      });
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  return buildProfileSky({
    constellations,
    events,
    courseNameById: maps.courseNameById,
    seriesNameBySlug: maps.seriesNameBySlug,
    lessonLabelBySlug: lessonLabels,
    rank: progress.rank,
    streakDays: progress.streakDays,
    longestStreakDays: progress.longestStreakDays,
    coursesCompleted: progress.coursesCompleted,
    tracksCompleted: progress.tracksCompleted,
  });
}
