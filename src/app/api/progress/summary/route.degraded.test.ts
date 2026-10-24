/**
 * route.degraded.test.ts — R2-5 forced-429 regression for
 * GET /api/progress/summary (t_ffe32443, lois AC map for t_247f5edd).
 *
 * Regression being pinned: a token-route 429 used to make the two progress
 * reads resolve a classified `DbTokenUnavailableError`; the handler's
 * `filterAccessible` seam then rethrew it and the catch answered
 * `500 {"error":"Server error"}` (route.ts:123 before R2-5). The documented
 * guest contract is an EMPTY summary at 200 — a signed-in learner must never
 * see a 5xx because the identity backend was busy.
 *
 * Only `fetch` is stubbed; the real route, the real `db/server.ts` and the
 * real access seam run.
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
  nonGetRequests,
  sessionCookieStore,
  type CapturedRequest,
} from "@/lib/db/test-support/throttled-auth";

// `quizStats` is part of the guest/degraded payload since the /atlas progress
// fan-out fix (t_22e18719 folded per-quiz aggregates into this route).
const EMPTY_SUMMARY = {
  readContent: { blog: [], lesson: [] },
  completedLessons: [],
  quizStats: {},
};

let captured: CapturedRequest[] = [];

beforeEach(() => {
  applyThrottledAuthEnv();
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

describe("GET /api/progress/summary under a token-route 429 (R2-5)", () => {
  it("answers 200 with the empty summary — never the 500 regression", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.status).not.toBe(500);
    expect(await res.json()).toEqual(EMPTY_SUMMARY);
    // Retarget guard (t_09dcebe3): the no-store delta was cut from the pre-R2-5
    // base, so this path must keep both the 200 guest contract and the header.
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("issues no Data API request at all — degraded reads resolve locally", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    await GET();

    expect(dataApiRequests(captured)).toHaveLength(0);
    expect(nonGetRequests(captured)).toHaveLength(0);
  });

  it("keeps the same guest shape for a cookieless visitor", async () => {
    cookiesMock.mockResolvedValue({
      getAll: () => [],
      get: () => undefined,
      has: () => false,
      set: () => undefined,
      delete: () => undefined,
    });
    captured = installThrottledAuth({ sessionUser: null });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(EMPTY_SUMMARY);
    expect(dataApiRequests(captured)).toHaveLength(0);
  });
});
