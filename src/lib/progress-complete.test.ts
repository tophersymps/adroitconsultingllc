/**
 * progress-complete.test.ts — server-authoritative lesson auto-completion.
 *
 * Covers completeLessonServer (the shared helper refactored out of
 * POST /api/progress/lesson) and checkCoveredLessonSlugs (the pure check-range
 * → slug mapping). These lock AC-1/AC-2 (perfect check completes its covered
 * lessons; partial never does), AC-3/AC-4 (exam pass completes the course
 * without writing lesson rows), and AC-5 (single shared helper) at the unit
 * boundary. Supabase is mocked — the helper's DB reads/writes are asserted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const from = vi.fn();
  return { mocks: { from } };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({ from: mocks.from }),
}));

// completion_events INSERT now routes via the service-role client (M2,
// t_bd7ac2a0, migration 012) — point it at the same capture fake so the
// course/lesson event assertions still observe the writes.
vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ from: mocks.from }),
}));

import {
  checkCoveredLessonSlugs,
  completeCheckLessonsOnPerfectScore,
  completeLessonServer,
} from "./progress-complete";

/** Sink capturing the writes the helper issues (upserts / inserts). */
const sink = {
  lessonUpserts: [] as unknown[],
  courseEvents: [] as unknown[],
  lessonEvents: [] as unknown[],
  /** Table → final async result (data / count). */
  reads: {} as Record<string, unknown>,
};

/**
 * A configurable chainable fake for the mocked supabase `from(table)`.
 * Default: every chain resolves to { data: null, error: null } / count 0, and
 * writes are captured per table. Tests override via sink.reads.
 */
function makeFrom(table: string) {
  // quiz_attempt reads are awaited at the second .eq() — resolve with the
  // configured rows so completeCheckLessonsOnPerfectScore can derive a score.
  if (table === "quiz_attempt") {
    return {
      select: () => ({
        eq: () => ({
          eq: async () => ({ data: sink.reads.quiz_attempt ?? null, error: null }),
        }),
      }),
    };
  }
  const c: Record<string, unknown> = {
    select: vi.fn(() => c),
    eq: vi.fn(() => c),
    in: vi.fn(() => c),
    limit: vi.fn(() => c),
    order: vi.fn(() => c),
    insert: vi.fn(async (rows: unknown) => {
      const list = Array.isArray(rows) ? rows : [rows];
      if (table === "completion_events") {
        for (const r of list as { event_type: string }[]) {
          if (r.event_type === "course") sink.courseEvents.push(r);
          else sink.lessonEvents.push(r);
        }
      }
      return { error: null };
    }),
    maybeSingle: vi.fn(async () => {
      if (table === "courses") return { data: { id: "course-1" }, error: null };
      return { data: null, error: null };
    }),
  };
  if (table === "lesson_completion") {
    c.upsert = vi.fn(async (rows: unknown) => {
      sink.lessonUpserts.push(rows);
      return { error: null };
    });
  }
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  sink.lessonUpserts.length = 0;
  sink.courseEvents.length = 0;
  sink.lessonEvents.length = 0;
  for (const k of Object.keys(sink.reads)) delete sink.reads[k];

  mocks.from.mockImplementation((table: string) => {
    const c = makeFrom(table);
    // A "count head" read on lesson_completion: return configured count.
    const configured = sink.reads[`count:${table}`];
    if (table === "lesson_completion" && configured !== undefined) {
      c.select = vi.fn(() => ({
        eq: vi.fn(() => ({ in: vi.fn(async () => ({ count: configured, error: null })) })),
      }));
    }
    return c;
  });
});

describe("completeLessonServer (lesson tier)", () => {
  it("upserts the lesson_completion row and logs a 'lesson' event (AC-5 lesson path)", async () => {
    const res = await completeLessonServer({
      userId: "u1",
      lessonSlugs: ["lesson-1"],
      series: "omni-studio-cert",
    });
    expect(res).toEqual({ ok: true });
    expect(sink.lessonUpserts).toHaveLength(1);
    const upsert = sink.lessonUpserts[0] as Record<string, unknown>;
    expect(upsert).toMatchObject({ user_id: "u1", lesson_slug: "lesson-1" });
    expect(sink.lessonEvents).toHaveLength(1);
    expect(sink.lessonEvents[0]).toMatchObject({ event_type: "lesson", lesson_slug: "lesson-1" });
  });

  it("logs the 'course' event only when every published lesson in the series is complete", async () => {
    // Full coverage → course complete.
    sink.reads["count:lesson_completion"] = 999;
    await completeLessonServer({ userId: "u1", lessonSlugs: ["lesson-1"], series: "omni-studio-cert" });
    expect(sink.courseEvents).toHaveLength(1);

    sink.courseEvents.length = 0;
    sink.reads["count:lesson_completion"] = 1; // not all done
    await completeLessonServer({ userId: "u1", lessonSlugs: ["lesson-1"], series: "omni-studio-cert" });
    expect(sink.courseEvents).toHaveLength(0);
  });

  it("surfaces a primary lesson_completion write error", async () => {
    mocks.from.mockImplementation((table: string) => {
      const c = makeFrom(table);
      if (table === "lesson_completion") {
        c.upsert = vi.fn(async () => ({ error: { message: "upsert boom" } }));
      }
      return c;
    });
    const res = await completeLessonServer({ userId: "u1", lessonSlugs: ["lesson-1"], series: "s" });
    expect(res).toEqual({ ok: false, error: { message: "upsert boom" } });
  });
});

describe("completeLessonServer (exam tier, viaExamPass)", () => {
  it("completes the course WITHOUT writing any lesson_completion row (AC-3/AC-4)", async () => {
    const res = await completeLessonServer({
      userId: "u1",
      series: "omni-studio-cert",
      viaExamPass: true,
    });
    expect(res).toEqual({ ok: true });
    expect(sink.lessonUpserts).toHaveLength(0); // no lesson rows
    expect(sink.courseEvents).toHaveLength(1); // course complete
    expect(sink.lessonEvents).toHaveLength(0);
    expect(sink.courseEvents[0]).toMatchObject({ event_type: "course" });
  });
});

describe("checkCoveredLessonSlugs (AC-1 range → slug)", () => {
  it("maps a check's lesson range [5n-4,5n] to its published slugs", () => {
    const slugs = checkCoveredLessonSlugs("omni-studio-cert", 1); // lessons 1..5
    expect(slugs.length).toBeGreaterThan(0);
    expect(slugs.length).toBeLessThanOrEqual(5);
    // Every slug maps to a published lesson in the 1..5 range.
    // (Exact slugs are content-derived; we assert the shape here and the
    // range contract in the route-level test.)
    for (const s of slugs) expect(typeof s).toBe("string");
  });

  it("returns [] for an unknown check number", () => {
    expect(checkCoveredLessonSlugs("omni-studio-cert", 999)).toEqual([]);
  });
});

describe("completeCheckLessonsOnPerfectScore (AC-1/AC-2)", () => {
  const CANONICAL = 15; // omni check-1 question count
  const perfectAttempts = Array.from({ length: CANONICAL }, (_, i) => ({
    quiz_name: "omni-studio-cert:check:1",
    question_index: i,
    is_correct: true,
  }));

  it("marks the check's covered lessons complete when the FULL set derives 100% (AC-1)", async () => {
    sink.reads.quiz_attempt = perfectAttempts;
    await completeCheckLessonsOnPerfectScore({
      userId: "u1",
      quizName: "omni-studio-cert:check:1",
      series: "omni-studio-cert",
      checkN: 1,
      canonicalTotal: CANONICAL,
    });
    // One lesson_completion upsert for the check's covered range.
    expect(sink.lessonUpserts.length).toBeGreaterThan(0);
    const slugs = (sink.lessonUpserts[0] as unknown[] | { lesson_slug: string }) as
      | unknown[]
      | { lesson_slug: string };
    // Range 1..5 → up to 5 slugs in a single batch (array) upsert.
    expect(Array.isArray(slugs)).toBe(true);
    if (Array.isArray(slugs)) {
      expect(slugs.length).toBeGreaterThan(0);
      expect(slugs.length).toBeLessThanOrEqual(5);
    }
  });

  it("never completes any lesson from a PARTIAL attempt set (AC-2 full-coverage guard)", async () => {
    // Only 3 of 15 questions answered — scoreQuizAttemptRows refuses to score
    // a partial set (returns no score), so no completion may fire.
    sink.reads.quiz_attempt = perfectAttempts.slice(0, 3);
    await completeCheckLessonsOnPerfectScore({
      userId: "u1",
      quizName: "omni-studio-cert:check:1",
      series: "omni-studio-cert",
      checkN: 1,
      canonicalTotal: CANONICAL,
    });
    expect(sink.lessonUpserts).toHaveLength(0);
  });

  it("never completes any lesson from a full but imperfect set (score < 100)", async () => {
    const imperfect = perfectAttempts.map((a, i) =>
      i === 0 ? { ...a, is_correct: false } : a,
    );
    sink.reads.quiz_attempt = imperfect;
    await completeCheckLessonsOnPerfectScore({
      userId: "u1",
      quizName: "omni-studio-cert:check:1",
      series: "omni-studio-cert",
      checkN: 1,
      canonicalTotal: CANONICAL,
    });
    expect(sink.lessonUpserts).toHaveLength(0);
  });
});
