/**
 * route.degraded.test.ts — R2-5 forced-429 regression for
 * GET /api/progress/achievement (t_ffe32443).
 *
 * The achievement block feeds the lesson-complete pop and the Learn hub
 * preview. When `/token` is throttled the stats read cannot go out; the
 * documented contract is the GUEST stats block at 200 (zeros, no rank) — never
 * a 5xx that would strip the pop for a signed-in learner.
 *
 * Only `fetch` is stubbed; the real route and `db/server.ts` run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

describe("GET /api/progress/achievement under a token-route 429 (R2-5)", () => {
  it("answers 200 with the guest stats block, never a 5xx", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    // The guest block: zeros plus the entry-level rank (ids, not copy).
    expect(body.stats.streakDays).toBe(0);
    expect(body.stats.longestStreakDays).toBe(0);
    expect(body.stats.coursesCompleted).toBe(0);
    expect(body.stats.tracksCompleted).toBe(0);
    expect(body.stats.rank?.id).toBe("starseed");
  });

  it("issues no Data API request when it cannot mint a token", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    await GET();

    expect(dataApiRequests(captured)).toHaveLength(0);
  });
});
