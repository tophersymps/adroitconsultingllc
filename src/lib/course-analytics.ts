/**
 * src/lib/course-analytics.ts — per-course completion analytics (v4,
 * t_0ed19ad0). Pure aggregation over existing progress tables
 * (lesson_completion + read_progress) + the courses rows, joined to content
 * (lib/learn) so lesson slugs map to their series. No chart library — the
 * admin surface renders CSS bars + one inline SVG from this data.
 */
import { getLessonsForSeries } from "@/lib/learn";
import type { CourseRow } from "@/shared/contracts-course-catalog";

/** Raw row from lesson_completion (service client). */
export interface CompletionRow {
  user_id: string;
  lesson_slug: string;
  completed_at: string;
}

/** Raw row from read_progress (service client). */
export interface ReadProgressRow {
  user_id: string;
  content_type: "blog" | "lesson";
  content_slug: string;
  read_at: string;
}

export type AnalyticsSignal = "on-track" | "in-progress" | "no-data";

export interface CourseAnalyticsRow {
  seriesSlug: string;
  title: string;
  status: CourseRow["status"];
  accessModel: CourseRow["access_model"];
  enrollmentCount: number;
  lessonsCompleted: number;
  totalLessons: number;
  /** 0-100; 0 when no enrollment. */
  avgProgress: number;
  signal: AnalyticsSignal;
}

export interface CourseAnalyticsResult {
  courses: CourseAnalyticsRow[];
  summary: {
    totalEnrollments: number;
    /** Weighted by enrollment; 0 when no enrollments. */
    avgCompletion: number;
    onTrackCount: number;
    courseCount: number;
  };
  /** Last 8 ISO weeks, oldest first — avg learner progress as of each week end. */
  weekly: { week: string; avgProgress: number }[];
  /** Percentage-point change: last week vs 4 weeks prior. */
  trendDelta: number;
}

function signalFor(avg: number, enrolled: number): AnalyticsSignal {
  if (enrolled === 0 || avg < 30) return "no-data";
  if (avg >= 70) return "on-track";
  return "in-progress";
}

/** Map a completion/read lesson slug to its series (null when unknown). */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Monday-aligned start of the ISO week containing `ts`. */
function startOfIsoWeek(ts: number): number {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return start.getTime();
}

/** Build the last `weeks` Monday-aligned week boundaries (oldest first). */
function lastNWeeks(weeks: number, now: number): { start: number; end: number; label: string }[] {
  const current = startOfIsoWeek(now);
  const out: { start: number; end: number; label: string }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = current - i * WEEK_MS;
    out.push({
      start,
      end: start + WEEK_MS,
      label: new Date(start).toISOString().slice(0, 10),
    });
  }
  return out;
}

/**
 * Pure analytics aggregation. `courseLessonSlugs` maps a series slug to its
 * published lesson slugs (built from getLessonsForSeries by the caller so
 * the module stays DB/content-agnostic and unit-testable).
 */
export function computeCourseAnalytics(input: {
  courses: CourseRow[];
  courseLessonSlugs: Record<string, string[]>;
  completions: CompletionRow[];
  reads: ReadProgressRow[];
  now?: string;
}): CourseAnalyticsResult {
  const now = input.now ? new Date(input.now).getTime() : Date.now();
  const weeks = lastNWeeks(8, now);

  // lesson slug → series (via the per-course slug maps).
  const slugToSeries = new Map<string, string>();
  for (const [series, slugs] of Object.entries(input.courseLessonSlugs)) {
    for (const s of slugs) slugToSeries.set(s, series);
  }

  // completion rows per (user, series)
  const completionByUserSeries = new Map<string, number>();
  // completion timestamps per (user, series) for the weekly curve
  const completionTs = new Map<string, number[]>();
  const readsBySeriesUser = new Map<string, Set<string>>();

  for (const c of input.completions) {
    const series = slugToSeries.get(c.lesson_slug);
    if (!series) continue;
    const key = `${c.user_id}\u0000${series}`;
    completionByUserSeries.set(key, (completionByUserSeries.get(key) ?? 0) + 1);
    const ts = new Date(c.completed_at).getTime();
    if (!Number.isNaN(ts)) {
      const arr = completionTs.get(key) ?? [];
      arr.push(ts);
      completionTs.set(key, arr);
    }
  }
  for (const r of input.reads) {
    if (r.content_type !== "lesson") continue;
    const lessonSlug = r.content_slug.replace(/^lesson\//, "");
    const series = slugToSeries.get(lessonSlug);
    if (!series) continue;
    let set = readsBySeriesUser.get(series);
    if (!set) {
      set = new Set();
      readsBySeriesUser.set(series, set);
    }
    set.add(r.user_id);
  }

  const weeklySum: number[] = new Array(weeks.length).fill(0);
  let weeklyLearners = 0;

  const courses: CourseAnalyticsRow[] = input.courses.map((course) => {
    const series = course.series_slug;
    const lessons = input.courseLessonSlugs[series] ?? [];
    const lessonCount = lessons.length;
    const enrolledUsers = new Set<string>();
    for (const [k] of completionByUserSeries) {
      if (k.endsWith(`\u0000${series}`)) enrolledUsers.add(k.split("\u0000")[0]!);
    }
    for (const uid of readsBySeriesUser.get(series) ?? []) enrolledUsers.add(uid);

    const enrollmentCount = enrolledUsers.size;
    let lessonsCompleted = 0;
    let progressSum = 0;
    for (const uid of enrolledUsers) {
      const key = `${uid}\u0000${series}`;
      const done = completionByUserSeries.get(key) ?? 0;
      lessonsCompleted += done;
      if (lessonCount > 0) progressSum += Math.min(1, done / lessonCount);
    }
    const avgProgress =
      enrollmentCount > 0 ? Math.round((progressSum / enrollmentCount) * 100) : 0;

    // Weekly cumulative average progress (as of each week end), aggregated
    // globally across every (course, learner) so the curve is not skewed by
    // course count.
    for (const uid of enrolledUsers) {
      weeklyLearners++;
      for (let w = 0; w < weeks.length; w++) {
        const weekEnd = weeks[w]!.end;
        let doneByWeek = 0;
        for (const ts of completionTs.get(`${uid}\u0000${series}`) ?? []) {
          if (ts < weekEnd) doneByWeek++;
        }
        if (lessonCount > 0) {
          weeklySum[w]! += Math.min(1, doneByWeek / lessonCount);
        }
      }
    }

    return {
      seriesSlug: series,
      title: course.title,
      status: course.status,
      accessModel: course.access_model,
      enrollmentCount,
      lessonsCompleted,
      totalLessons: lessonCount,
      avgProgress,
      signal: signalFor(avgProgress, enrollmentCount),
    };
  });

  // Average the weekly curve across every (course, learner) pair.
  const totalEnrollments = courses.reduce((s, c) => s + c.enrollmentCount, 0);
  const weekly = weeks.map((w, i) => ({
    week: w.label,
    avgProgress:
      weeklyLearners > 0
        ? Math.min(100, Math.round((weeklySum[i]! / weeklyLearners) * 100))
        : 0,
  }));

  const weightedSum = courses.reduce(
    (s, c) => s + c.avgProgress * c.enrollmentCount,
    0,
  );
  const avgCompletion =
    totalEnrollments > 0 ? Math.round(weightedSum / totalEnrollments) : 0;
  const onTrackCount = courses.filter((c) => c.signal === "on-track").length;

  const last = weekly[weekly.length - 1]?.avgProgress ?? 0;
  const prior = weekly[Math.max(0, weekly.length - 5)]?.avgProgress ?? 0;
  const trendDelta = Math.round(last - prior);

  return {
    courses,
    summary: {
      totalEnrollments,
      avgCompletion,
      onTrackCount,
      courseCount: courses.length,
    },
    weekly,
    trendDelta,
  };
}

/** Build the per-series published lesson slug map from content (for the route). */
export function buildCourseLessonSlugs(slugs: string[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const slug of slugs) {
    map[slug] = getLessonsForSeries(slug)
      .filter((l) => l.status !== "draft")
      .map((l) => l.slug);
  }
  return map;
}
