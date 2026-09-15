/**
 * route.test.ts — POST /api/progress/quiz (single quiz attempt).
 *
 * Security (t_3bbee885 F3): correctness is RECOMPUTED server-side from the
 * canonical quiz JSON — the client's `correctAnswerIndex` / `isCorrect` are
 * treated as hints and never trusted verbatim.
 *
 * Server-write-only (t_bb6ed113): quiz_attempt is RLS read-only for clients
 * (migration 006), so the graded upsert MUST go through the service-role
 * client, never the RLS-bound (anon/cookie) server client.
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

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ from: mocks.serviceFrom }),
}));

// The route gates through the access seam (t_10214e52). Default: the quiz's
// course is granted. Individual tests override to assert the 403 path.
vi.mock("@/lib/access", () => ({
  accessSeam: { decideCourseAccess: mocks.decideCourseAccess },
}));

import { POST } from "./route";

const CHECK_QUIZ = "omni-studio-cert:check:1"; // canonical: 15 questions

const writeSink = { quizAttemptUpserts: [] as unknown[] };

/** Service-role client: quiz_attempt upsert → sink (the ONLY write). */
function makeServiceFrom(table: string) {
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

function post(body: Record<string, unknown>): Promise<Response> {
  return POST(
    new NextRequest("http://localhost:3000/api/progress/quiz", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.11" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  writeSink.quizAttemptUpserts.length = 0;
  mocks.decideCourseAccess.mockResolvedValue({ kind: "granted" });
  mocks.serviceFrom.mockImplementation((table: string) => makeServiceFrom(table));
});

describe("POST /api/progress/quiz — server-side recompute (F3)", () => {
  it("returns unauthenticated and writes nothing for guests", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await post({
      quizName: CHECK_QUIZ,
      questionIndex: 0,
      userAnswerIndex: 2,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("unauthenticated");
    expect(writeSink.quizAttemptUpserts).toHaveLength(0);
  });

  it("returns NO grading result to guests (answer key never leaks pre-auth, t_79a92b83)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await post({
      quizName: CHECK_QUIZ,
      questionIndex: 0,
      userAnswerIndex: 2,
    });
    const body = await res.json();
    expect(body.status).toBe("unauthenticated");
    expect(body.result).toBeUndefined();
  });

  it("returns the server-graded result for the answered question (t_79a92b83)", async () => {
    authedUser();
    const res = await post({
      quizName: CHECK_QUIZ,
      questionIndex: 0,
      userAnswerIndex: 2, // correct
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.result).toEqual({
      isCorrect: true,
      correctAnswerIndex: 2,
      explanation:
        "OmniScripts build guided experiences; IPs can be invoked from them for server-side orchestration.",
    });
  });

  it("recomputes correctness server-side, ignoring the client's isCorrect hint", async () => {
    authedUser();
    // q0 correct answer is index 2. The client picks index 0 (wrong) but
    // LIES that it is correct — the server must recompute is_correct=false.
    const res = await post({
      quizName: CHECK_QUIZ,
      questionIndex: 0,
      userAnswerIndex: 0,
      correctAnswerIndex: 2, // client hint — ignored
      isCorrect: true, // client hint — ignored
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // The graded result must reflect the SERVER's recomputation, not the
    // forged client hint (t_3bbee885 F3 / t_79a92b83).
    expect(body.result).toMatchObject({ isCorrect: false, correctAnswerIndex: 2 });
    expect(writeSink.quizAttemptUpserts).toHaveLength(1);
    expect(writeSink.quizAttemptUpserts[0]).toMatchObject({
      user_id: "user-1",
      quiz_name: CHECK_QUIZ,
      question_index: 0,
      correct_answer_index: 2, // canonical answer, not the client's
      user_answer_index: 0,
      is_correct: false, // recomputed — the client's `true` is rejected
    });
  });

  it("marks a correct answer as correct", async () => {
    authedUser();
    const res = await post({
      quizName: CHECK_QUIZ,
      questionIndex: 0,
      userAnswerIndex: 2, // correct
    });
    expect(res.status).toBe(200);
    expect(writeSink.quizAttemptUpserts).toHaveLength(1);
    expect(writeSink.quizAttemptUpserts[0]).toMatchObject({
      user_answer_index: 2,
      is_correct: true,
    });
  });

  it("rejects an out-of-range userAnswerIndex with 400 and writes nothing", async () => {
    authedUser();
    const res = await post({
      quizName: CHECK_QUIZ,
      questionIndex: 0,
      userAnswerIndex: 99, // only 4 options
    });
    expect(res.status).toBe(400);
    expect(writeSink.quizAttemptUpserts).toHaveLength(0);
  });

  it("writes the attempt through the SERVICE client, never the RLS/anonymous server client (server-write-only, t_bb6ed113)", async () => {
    authedUser();
    const res = await post({
      quizName: CHECK_QUIZ,
      questionIndex: 0,
      userAnswerIndex: 2,
    });
    expect(res.status).toBe(200);

    expect(mocks.serviceFrom).toHaveBeenCalledWith("quiz_attempt");
    expect(writeSink.quizAttemptUpserts).toHaveLength(1);

    // The RLS/anonymous server client must never be used to write quiz_attempt.
    const rlsUpsert = mocks.from.mock.results.find(
      (r) => (r.value as { upsert?: unknown } | undefined)?.upsert !== undefined,
    );
    expect(rlsUpsert).toBeUndefined();
  });

  it("rejects a user with no entitlement to the quiz's course with 403 and no answer key (t_10214e52)", async () => {
    authedUser();
    // Paywalled course → the gate must deny before any write / grading reply.
    mocks.decideCourseAccess.mockResolvedValue({ kind: "paywall" });
    const res = await post({
      quizName: CHECK_QUIZ,
      questionIndex: 0,
      userAnswerIndex: 2, // correct answer — would otherwise be disclosed
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.result).toBeUndefined(); // answer key never leaks
    expect(writeSink.quizAttemptUpserts).toHaveLength(0);
  });
});
