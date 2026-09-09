/**
 * src/lib/completion.ts — Learn Platform v2 completion foundation (plan §3f).
 *
 * Powers the future Constellations + Chronicle achievement system (V2 visual
 * layer). completion_events is an append-only log (ADR-211); the current-state
 * store stays in lesson_completion (001). Here we provide:
 *   - deriveProgress(): pure, unit-testable progress/rank derivation from the
 *     append-only event log (no DB columns, no denormalized drift).
 *   - helpers to append lesson/course events and read the user's completed
 *     course ids (drives the prerequisitesMet gate on outlines).
 *
 * Contract types: src/shared/contracts-course-catalog.ts (CompletionInput,
 * DerivedProgress, CompletionEventRow).
 */
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type {
  CompletionEventRow,
  CompletionInput,
  DerivedProgress,
} from "@/shared/contracts-course-catalog";
import type {
  CompletionEventType,
  CompletionMetadata,
} from "@/shared/contracts-constellations";
// Client-safe rank ladder (ADR-214). Re-exported here for backward compat.
import { deriveRank, RANK_LADDER } from "@/shared/rank-ladder";
export { deriveRank, RANK_LADDER };

/** "YYYY-MM-DD" from an ISO timestamp. */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function parseDay(d: string): number {
  return Date.UTC(
    Number(d.slice(0, 4)),
    Number(d.slice(5, 7)) - 1,
    Number(d.slice(8, 10)),
  );
}

function isConsecutiveDay(a: string, b: string): boolean {
  const diff = (parseDay(b) - parseDay(a)) / 86400000;
  return diff === 1;
}

/** Re-exported for backward compatibility (see src/shared/rank-ladder.ts). */

/**
 * Derive progress/rank from the user's append-only completion events.
 * Pure — injectable `now` + full event set for deterministic tests.
 *
 *  - lessonsCompleted: distinct lessons (event_type=lesson) completed.
 *  - coursesCompleted: distinct courses (event_type=course) completed.
 *  - tracksCompleted:  tracks where EVERY course in the track has a course
 *                      completion event (from `courseTracks` membership).
 *  - streakDays / longestStreakDays: consecutive whole days with ≥1 completion.
 *  - timeToCompleteDays: whole-day span from the user's first to last
 *                      completion event (null when <2 events).
 */
export function deriveProgress(input: CompletionInput): DerivedProgress {
  const { events, courseTracks } = input;

  const lessonSlugs = new Set(
    events
      .filter((e) => e.event_type === "lesson" && e.lesson_slug)
      .map((e) => e.lesson_slug as string),
  );
  const coursesCompleted = new Set(
    events
      .filter((e) => e.event_type === "course" && e.course_id)
      .map((e) => e.course_id as string),
  );

  // Tracks: a track is complete when every course in it has a course event.
  const trackMembers = new Map<string, string[]>();
  for (const [courseId, track] of Object.entries(courseTracks)) {
    if (!trackMembers.has(track)) trackMembers.set(track, []);
    trackMembers.get(track)!.push(courseId);
  }
  let tracksCompleted = 0;
  for (const members of trackMembers.values()) {
    if (members.length > 0 && members.every((id) => coursesCompleted.has(id))) {
      tracksCompleted++;
    }
  }

  // Streaks over distinct completion days. The CURRENT streak is relative to
  // the injected `now` (B-19 bug fix): the streak is only "alive" when the
  // most recent completion is today or yesterday relative to `now`. If the
  // last completion is older than that (neither today nor yesterday), the
  // streak resets to 0 — you've broken the chain.
  const days = Array.from(
    new Set(events.map((e) => dayOf(e.completed_at))),
  ).sort();
  let streakDays = 0;
  let longestStreakDays = 0;
  if (days.length > 0) {
    // Longest run anywhere (independent of `now`).
    let run = 1;
    let longest = 1;
    for (let i = 1; i < days.length; i++) {
      if (isConsecutiveDay(days[i - 1], days[i])) {
        run++;
        if (run > longest) longest = run;
      } else {
        run = 1;
      }
    }
    longestStreakDays = longest;

    // Current streak: the consecutive run ending at the most recent completion
    // day, but ONLY if that day is today or yesterday relative to `now`.
    const lastDay = days[days.length - 1]!;
    const today = dayOf(input.now);
    const sinceLast = (parseDay(today) - parseDay(lastDay)) / 86400000;
    if (sinceLast <= 1) {
      // Most recent completion is today or yesterday → count the run backward.
      streakDays = 1;
      for (let i = days.length - 1; i > 0; i--) {
        if (isConsecutiveDay(days[i - 1], days[i])) streakDays++;
        else break;
      }
    }
  }

  // Time-to-complete: span (in whole days) across the user's completion events.
  let timeToCompleteDays: number | null = null;
  const times = events
    .map((e) => Date.parse(e.completed_at))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (times.length >= 2) {
    timeToCompleteDays = Math.max(
      1,
      Math.round((times[times.length - 1] - times[0]) / 86400000),
    );
  }

  return {
    lessonsCompleted: lessonSlugs.size,
    coursesCompleted: coursesCompleted.size,
    tracksCompleted,
    streakDays,
    longestStreakDays,
    timeToCompleteDays,
    rank: deriveRank(lessonSlugs.size, coursesCompleted.size),
  };
}

/**
 * Append a completion event (lesson, course, quiz, exam, or certificate).
 * Idempotent per (user, course, event_type, lesson_slug): re-marking an
 * already-logged event is a no-op — the log stays append-only (ADR-211)
 * without duplicate rows. Best-effort: a failure logs server-side and never
 * throws (the primary write already landed).
 */
export async function appendCompletionEvent(input: {
  userId: string;
  courseId: string | null;
  eventType: CompletionEventType;
  lesson?: number | null;
  lessonSlug?: string | null;
  /** Optional event envelope: score/tier for quiz/exam/certificate (B-19). */
  metadata?: CompletionMetadata | null;
}): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    // Idempotency guard: skip when an identical event already exists.
    const q = supabase
      .from("completion_events")
      .select("id")
      .eq("user_id", input.userId);
    if (input.courseId) q.eq("course_id", input.courseId);
    q.eq("event_type", input.eventType);
    if (input.lessonSlug) q.eq("lesson_slug", input.lessonSlug);

    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw error;
    if (data) return; // already logged — no duplicate

    // M2 (t_bd7ac2a0): the INSERT goes through the service-role client.
    // Migration 012 denies the `authenticated` role's INSERT on completion_events
    // (CWE-807 self-forge close, mirroring migration 006 for quiz_run/quiz_attempt),
    // so an anon-key / cookie client can no longer write. The service_role key
    // carries BYPASSRLS and remains the only legitimate write path. The reads
    // above stay on the RLS-bound client so a value is never written for a user
    // whose session has not been resolved by auth.
    await getSupabaseServiceClient()
      .from("completion_events")
      .insert({
        user_id: input.userId,
        course_id: input.courseId ?? null,
        event_type: input.eventType,
        lesson: input.lesson ?? null,
        lesson_slug: input.lessonSlug ?? null,
        metadata: input.metadata ?? null,
        completed_at: new Date().toISOString(),
      });
  } catch (err) {
    console.error("[completion-event]", input.eventType, err);
  }
}

/**
 * The lesson_slugs the user has CURRENTLY completed, read from the mutable
 * current-state store `lesson_completion` (migration 001). This is the single
 * source of truth for "which lessons are done right now" — it is written on
 * mark-complete (POST /api/progress/lesson upsert) and cleared on unmark
 * (DELETE removes the row). Both the on-course tracker (/learn/[series]) and
 * the profile sky derive their constellation lighting from THIS set, so the
 * two surfaces always agree after a mark OR an unmark.
 *
 * NOTE (deep-sky v1.2.0 / ADR-211): completion_events is the append-only
 * HISTORICAL log used to derive streaks / rank / chronicle. It is NOT used to
 * light constellations, because unmarking a lesson would otherwise leave a
 * stale 'lesson' event and the profile sky would show it lit forever. Keep the
 * log immutable; read current lesson state from lesson_completion here.
 */
export async function getCompletedLessonSlugs(
  userId: string,
): Promise<Set<string>> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("lesson_completion")
      .select("lesson_slug")
      .eq("user_id", userId);
    if (error) throw error;
    return new Set(
      ((data ?? []) as { lesson_slug: string }[]).map((r) => r.lesson_slug),
    );
  } catch (err) {
    console.error("[completion] getCompletedLessonSlugs", err);
    return new Set();
  }
}

/**
 * The course_ids the user has fully completed (event_type='course'), read
 * through the RLS cookie-bound client (scoped to owner). Drives the
 * prerequisitesMet gate on course outlines.
 */
export async function getCompletedCourseIds(
  userId: string,
): Promise<Set<string>> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("completion_events")
      .select("course_id")
      .eq("user_id", userId)
      .eq("event_type", "course")
      .not("course_id", "is", null);
    if (error) throw error;
    return new Set(
      ((data ?? []) as { course_id: string | null }[])
        .map((r) => r.course_id)
        .filter((c): c is string => Boolean(c)),
    );
  } catch (err) {
    console.error("[completion] getCompletedCourseIds", err);
    return new Set();
  }
}

/** Re-export the row type for convenience. */
export type { CompletionEventRow };
