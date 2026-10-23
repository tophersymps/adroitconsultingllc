/**
 * route.degraded.test.ts — R2-5 forced-429 regression for
 * POST /api/progress/quiz/batch (t_ffe32443).
 *
 * The exam batch route writes graded attempts, so a token failure must never
 * be mistaken for a grading result. Its guest shape is the strictest one:
 * 401 `{status:"unauthenticated"}` with ZERO writes — the exam stays
 * un-submitted and the learner is asked to try again once the identity
 * backend is reachable.
 *
 * Only `fetch` is stubbed; the real route, `db/server.ts`, the access seam and
 * the server-only writer module run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { cookiesMock, writeMocks } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  writeMocks: { insertQuizRun: vi.fn(), upsertQuizAttempts: vi.fn() },
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

// A degraded path must never reach the privileged direct-SQL writer.
vi.mock("@/lib/db/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/service")>()),
  insertQuizRun: writeMocks.insertQuizRun,
  upsertQuizAttempts: writeMocks.upsertQuizAttempts,
}));

import { POST } from "./route";
import { resetAnonymousTokenCacheForTests } from "@/lib/db/anonymous-token";
import {
  applyThrottledAuthEnv,
  clearThrottledAuthEnv,
  dataApiRequests,
  installThrottledAuth,
  sessionCookieStore,
  type CapturedRequest,
} from "@/lib/db/test-support/throttled-auth";

const EXAM = "omni-studio-cert:exam";

function submit() {
  return POST(
    new NextRequest("http://localhost:3000/api/progress/quiz/batch", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.11" },
      body: JSON.stringify({ quizName: EXAM, elapsedSeconds: 60, answers: [] }),
    }),
  );
}

let captured: CapturedRequest[] = [];

beforeEach(() => {
  applyThrottledAuthEnv();
  captured = [];
  cookiesMock.mockReset();
  cookiesMock.mockResolvedValue(sessionCookieStore());
  writeMocks.insertQuizRun.mockReset();
  writeMocks.upsertQuizAttempts.mockReset();
  resetAnonymousTokenCacheForTests();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearThrottledAuthEnv();
});

describe("POST /api/progress/quiz/batch under a token-route 429 (R2-5)", () => {
  it("answers 401 {status:'unauthenticated'} instead of a 5xx", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    const res = await submit();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ status: "unauthenticated" });
  });

  it("writes nothing and issues no Data API request", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    await submit();

    expect(writeMocks.upsertQuizAttempts).not.toHaveBeenCalled();
    expect(writeMocks.insertQuizRun).not.toHaveBeenCalled();
    expect(dataApiRequests(captured)).toHaveLength(0);
  });
});
