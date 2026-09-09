/**
 * route.test.ts — GET /api/progress/achievement (B-18).
 *
 * Returns AchievementStats for the P1 lesson-complete pop + hub preview.
 * Guests / signed-out callers get an EMPTY stats block (never 401) so the hub
 * preview stays functional pre-login. Auth path is mocked; derivation is
 * pure (sky-server loadAchievementStats is stubbed here, real derivation is
 * covered by the completion.ts / sky.test.ts suites).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const getUser = vi.fn();
  const loadAchievementStats = vi.fn();
  return { mocks: { getUser, loadAchievementStats } };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock("@/lib/sky-server", () => ({
  loadAchievementStats: mocks.loadAchievementStats,
}));

import { GET } from "./route";

const authedStats = {
  streakDays: 14,
  longestStreakDays: 21,
  rank: null,
  coursesCompleted: 2,
  tracksCompleted: 1,
};

const guestStats = {
  streakDays: 0,
  longestStreakDays: 0,
  rank: null,
  coursesCompleted: 0,
  tracksCompleted: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadAchievementStats.mockResolvedValue(guestStats);
});

describe("GET /api/progress/achievement (B-18)", () => {
  it("returns the caller's stats for an authenticated user", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    mocks.loadAchievementStats.mockResolvedValue(authedStats);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stats).toEqual(authedStats);
    // The loader was scoped to the authenticated user id.
    expect(mocks.loadAchievementStats).toHaveBeenCalledWith("u1");
  });

  it("returns an empty stats block for a guest (no 401, no data leak)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stats).toEqual(guestStats);
    expect(mocks.loadAchievementStats).toHaveBeenCalledWith(null);
  });

  it("degrades to guest stats when the session read throws", async () => {
    mocks.getUser.mockRejectedValue(new Error("boom"));

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stats).toEqual(guestStats);
  });
});
