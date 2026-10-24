/**
 * route.degraded.test.ts — R2-5 forced-429 regression for
 * GET /api/progress/quiz/tiers (t_ffe32443).
 *
 * The series-page rollup feeds the check/exam cards. Under a token-route 429
 * the entitlement gate throws the classified sentinel and the route must answer
 * the zeros contract at 200 — the cards render CTA-safe zeros, and no question
 * text ever appears. A 5xx here blanks the whole course sidebar.
 *
 * Only `fetch` is stubbed; the real route, `db/server.ts` and the access seam
 * run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import { GET } from "./route";
import { resetAnonymousTokenCacheForTests } from "@/lib/db/anonymous-token";
import {
  applyThrottledAuthEnv,
  clearThrottledAuthEnv,
  dataApiRequests,
  installThrottledAuth,
  sessionCookieStore,
  type CapturedRequest,
} from "@/lib/db/test-support/throttled-auth";

const SERIES = "omni-studio-cert";

function request() {
  return GET(
    new NextRequest(
      `http://localhost:3000/api/progress/quiz/tiers?series=${SERIES}`,
    ),
  );
}

let captured: CapturedRequest[] = [];

beforeEach(() => {
  applyThrottledAuthEnv();
  captured = [];
  cookiesMock.mockReset();
  cookiesMock.mockResolvedValue(sessionCookieStore());
  resetAnonymousTokenCacheForTests();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearThrottledAuthEnv();
});

describe("GET /api/progress/quiz/tiers under a token-route 429 (R2-5)", () => {
  it("answers 200 with zeroed tiers, never 5xx", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    const res = await request();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lessons.completed).toBe(0);
    expect(body.unlocked).toBe(false);
    expect(body.exam).toEqual({ bestScore: 0, attempts: 0, passed: false });
    expect(Array.isArray(body.checks)).toBe(true);
    for (const check of body.checks) {
      expect(check.bestScore).toBe(0);
      expect(check.attempts).toBe(0);
      expect(check.passed).toBe(false);
    }
  });

  it("issues no Data API request when no token can be minted", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    await request();

    expect(dataApiRequests(captured)).toHaveLength(0);
  });

  it("never serialises question text into the zeros payload", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    const res = await request();
    const raw = JSON.stringify(await res.json());

    expect(raw).not.toContain("correct_answer_index");
    expect(raw).not.toMatch(/questionText|question_text/);
  });
});
