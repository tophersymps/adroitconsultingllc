/**
 * route.test.ts — POST /api/progress/quiz/batch exam-unlock gate.
 *
 * Regression test for security audit t_05fad9a9 (OWASP A01 / CWE-285):
 * the exam must be rejected with 403 unless the user has passed EVERY
 * knowledge check (best score >= 80) for the series. Exercises the real
 * route handler with a mocked Supabase client so the unlock predicate and
 * the grading path both run against the real content files.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const getSupabaseServerClient = vi.fn();
  const getSupabaseServiceClient = vi.fn();
  const getUser = vi.fn();
  const from = vi.fn();
  const serviceFrom = vi.fn();
  const decideCourseAccess = vi.fn();
  return {
    mocks: { getSupabaseServerClient, getSupabaseServiceClient, getUser, from, serviceFrom, decideCourseAccess },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));

// Server-write-only (t_bb6ed113): quiz_attempt/quiz_run writes MUST go
// through the service-role client, never the RLS-bound (anon/cookie) client.
vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ from: mocks.serviceFrom }),
}));

// The route gates through the access seam (t_10214e52). Default granted;
// tests override to assert the 403 path.
vi.mock("@/lib/access", () => ({
  accessSeam: { decideCourseAccess: mocks.decideCourseAccess },
}));

import { POST } from "./route";

const EXAM_QUIZ_NAME = "omni-studio-cert:exam";

/** A valid exam-submit body (question 0 answered correctly; grading is F3's job). */
function examBody(overrides: Record<string, unknown> = {}) {
  return {
    quizName: EXAM_QUIZ_NAME,
    answers: [{ questionIndex: 0, userAnswerIndex: 1 }], // q0 correct answer is 1
    elapsedSeconds: 30,
    ...overrides,
  };
}

function post(body: Record<string, unknown>): Promise<Response> {
  return POST(
    new NextRequest("http://localhost:3000/api/progress/quiz/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** Capture buffers for the graded writes (service client). */
const writeSink = {
  quizAttemptUpserts: [] as unknown[],
  quizRunInserts: [] as unknown[],
};

/** RLS/anonymous server client — reads only (gate check) — quiz_run SELECT. */
function makeFrom(table: string, checkRows: unknown) {
  if (table === "quiz_run") {
    return {
      select: () => ({
        eq: () => ({
          in: async () => ({ data: checkRows, error: null }),
        }),
      }),
    };
  }
  return {};
}

/** Service-role client — quiz_attempt upsert + quiz_run insert (the ONLY writes). */
function makeServiceFrom(table: string) {
  if (table === "quiz_run") {
    return {
      insert: async (row: unknown) => {
        writeSink.quizRunInserts.push(row);
        return { error: null };
      },
    };
  }
  if (table === "quiz_attempt") {
    return {
      upsert: async (rows: unknown) => {
        writeSink.quizAttemptUpserts.push(rows);
        return { error: null };
      },
    };
  }
  return {};
}

function authedUser(id = "user-1") {
  mocks.getUser.mockResolvedValue({ data: { user: { id } } });
}

function unauthenticated() {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
}

beforeEach(() => {
  vi.clearAllMocks();
  writeSink.quizAttemptUpserts.length = 0;
  writeSink.quizRunInserts.length = 0;
  mocks.decideCourseAccess.mockResolvedValue({ kind: "granted" });
  mocks.from.mockImplementation((table: string) => makeFrom(table, []));
  mocks.serviceFrom.mockImplementation((table: string) => makeServiceFrom(table));
});

describe("POST /api/progress/quiz/batch — exam unlock gate", () => {
  it("returns 401 for unauthenticated requests (no gate check runs)", async () => {
    unauthenticated();
    const res = await post(examBody());
    expect(res.status).toBe(401);
    // Must reject before querying check runs.
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns 403 for a user with no entitlement to the exam's course, before any write (t_10214e52)", async () => {
    authedUser();
    // Paywalled course → the entitlement gate denies before the exam-unlock
    // re-verification and before any attempt/run write.
    mocks.decideCourseAccess.mockResolvedValue({ kind: "paywall" });
    const res = await post(examBody());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.status).toBeUndefined(); // not the unlock-required shape
    expect(writeSink.quizAttemptUpserts).toHaveLength(0);
    expect(writeSink.quizRunInserts).toHaveLength(0);
  });

  it("returns 403 unlock-required when the user has no check runs at all", async () => {
    authedUser();
    mocks.from.mockImplementation((table: string) => makeFrom(table, []));
    const res = await post(examBody());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.status).toBe("unlock-required");
    // Nothing may be written when the exam is locked.
    expect(writeSink.quizAttemptUpserts).toHaveLength(0);
    expect(writeSink.quizRunInserts).toHaveLength(0);
  });

  it("returns 403 unlock-required when any single check is below 80", async () => {
    authedUser();
    const checkRows = [
      { quiz_name: "omni-studio-cert:check:1", score: 95 },
      { quiz_name: "omni-studio-cert:check:2", score: 79 }, // < 80 → locked
      { quiz_name: "omni-studio-cert:check:3", score: 88 },
    ];
    mocks.from.mockImplementation((table: string) => makeFrom(table, checkRows));
    const res = await post(examBody());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.status).toBe("unlock-required");
    expect(writeSink.quizRunInserts).toHaveLength(0);
  });

  it("accepts the exam when every check best is >= 80 (retakes: best wins)", async () => {
    authedUser();
    const checkRows = [
      { quiz_name: "omni-studio-cert:check:1", score: 100 },
      { quiz_name: "omni-studio-cert:check:1", score: 60 }, // retake below — best is 100
      { quiz_name: "omni-studio-cert:check:2", score: 81 },
      { quiz_name: "omni-studio-cert:check:3", score: 82 },
      { quiz_name: "omni-studio-cert:check:4", score: 83 },
      { quiz_name: "omni-studio-cert:check:5", score: 84 },
      { quiz_name: "omni-studio-cert:check:6", score: 85 },
      { quiz_name: "omni-studio-cert:check:7", score: 86 },
      { quiz_name: "omni-studio-cert:check:8", score: 87 },
      { quiz_name: "omni-studio-cert:check:9", score: 88 },
    ];
    mocks.from.mockImplementation((table: string) => makeFrom(table, checkRows));
    const res = await post(examBody());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.score).toBe(2); // 1/60 correct → 2%
    // The quiz_run write is reached: exam submission recorded after unlock.
    expect(writeSink.quizRunInserts).toHaveLength(1);
    expect(writeSink.quizRunInserts[0]).toMatchObject({
      user_id: "user-1",
      quiz_name: EXAM_QUIZ_NAME,
    });
  });

  it("accounts for a partial answer set — writes unanswered questions as incorrect (t_55105899)", async () => {
    authedUser();
    // Submit only 1 of the 60 canonical exam questions. The route must NOT
    // leave quiz_attempt with a 1-row set (which F2 consumers would misread
    // as 1/1 = 100%): it writes all 60 rows, unanswered → user_answer_index
    // -1 sentinel, is_correct false.
    const checkRows = Array.from({ length: 9 }, (_, i) => ({
      quiz_name: `omni-studio-cert:check:${i + 1}`,
      score: 90,
    }));
    mocks.from.mockImplementation((table: string) => makeFrom(table, table === "quiz_run" ? checkRows : []));

    const res = await post(examBody());
    expect(res.status).toBe(200);
    const json = await res.json();
    // Canonical denominator: 1 correct / 60 total.
    expect(json.total).toBe(60);
    expect(json.correct).toBe(1);
    expect(json.score).toBe(2);
    expect(json.results).toHaveLength(60);

    // t_c0c452f5 (CWE-200): the review array must NOT leak the correct answer
    // key for unanswered questions. Only question 0 was submitted, so only its
    // result item carries correctAnswerIndex; the other 59 must omit it.
    const answered = json.results.find((r: { questionIndex: number }) => r.questionIndex === 0);
    const unanswered = json.results.find((r: { questionIndex: number }) => r.questionIndex === 1);
    expect(answered).toMatchObject({ isCorrect: true, correctAnswerIndex: 1 });
    expect(unanswered).toMatchObject({ isCorrect: false });
    expect(unanswered).not.toHaveProperty("correctAnswerIndex");
    expect(json.results.filter((r: { correctAnswerIndex?: number }) => "correctAnswerIndex" in r)).toHaveLength(1);

    // Full-coverage quiz_attempt upsert: 60 rows, question 0 submitted,
    // questions 1..59 unanswered sentinel (user_answer_index -1, incorrect).
    expect(writeSink.quizAttemptUpserts).toHaveLength(1);
    const rows = writeSink.quizAttemptUpserts[0] as Array<{
      question_index: number;
      user_answer_index: number;
      is_correct: boolean;
    }>;
    expect(rows).toHaveLength(60);
    const q0 = rows.find((r) => r.question_index === 0);
    expect(q0).toMatchObject({ user_answer_index: 1, is_correct: true });
    const q59 = rows.find((r) => r.question_index === 59);
    expect(q59).toMatchObject({ user_answer_index: -1, is_correct: false });
  });

  it("writes attempts + run through the SERVICE client, never the RLS server client (server-write-only, t_bb6ed113)", async () => {
    authedUser();
    const checkRows = Array.from({ length: 9 }, (_, i) => ({
      quiz_name: `omni-studio-cert:check:${i + 1}`,
      score: 90,
    }));
    mocks.from.mockImplementation((table: string) => makeFrom(table, checkRows));

    const res = await post(examBody());
    expect(res.status).toBe(200);

    // Graded writes are on the service-role client only.
    expect(mocks.serviceFrom).toHaveBeenCalledWith("quiz_attempt");
    expect(mocks.serviceFrom).toHaveBeenCalledWith("quiz_run");
    expect(writeSink.quizAttemptUpserts).toHaveLength(1);
    expect(writeSink.quizRunInserts).toHaveLength(1);

    // The RLS/anonymous server client performs ONLY reads (the gate SELECT);
    // it must never be used for quiz_attempt/quiz_run writes.
    const rlsQuizRun = mocks.from.mock.results.find(
      (r) => (r.value as { insert?: unknown } | undefined)?.insert !== undefined,
    );
    expect(rlsQuizRun).toBeUndefined();
    const rlsQuizAttempt = mocks.from.mock.results.find(
      (r) => (r.value as { upsert?: unknown } | undefined)?.upsert !== undefined,
    );
    expect(rlsQuizAttempt).toBeUndefined();
  });
});
