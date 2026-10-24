/**
 * route.degraded.test.ts — R2-5 forced-429 regression for
 * GET /api/continue-learning (t_ffe32443).
 *
 * The Learn hub calls this on every visit. Its contract for a caller whose
 * progress cannot be read is the guest shape `{items: []}` at 200 — a 5xx
 * would take the hub's resume rail down with the identity backend.
 *
 * Only `fetch` is stubbed; the real route, `db/server.ts` and the access seam
 * run.
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

describe("GET /api/continue-learning under a token-route 429 (R2-5)", () => {
  it("answers 200 {items:[]} instead of failing the hub", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
  });

  it("issues no Data API request when no token can be minted", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    await GET();

    expect(dataApiRequests(captured)).toHaveLength(0);
  });
});
