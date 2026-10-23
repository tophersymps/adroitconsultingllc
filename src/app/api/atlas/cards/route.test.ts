/**
 * route.test.ts — GET /api/atlas/cards (A11Y-M1, t_80131e31).
 *
 * The /atlas hub is prerendered with the guest projection, so this session-
 * gated route is what upgrades a signed-in visitor's cards after hydration.
 * Contract: guests get an empty list (the island then leaves the static
 * markup alone); signed-in users get a slim per-series delta carrying the two
 * fields the static card lacks — `canAccess` + `lessonSlugs`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const getSessionUser = vi.fn();
  const getCatalogForUserV2 = vi.fn();
  return { mocks: { getSessionUser, getCatalogForUserV2 } };
});

vi.mock("@/lib/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/lib/catalog", () => ({
  getCatalogForUserV2: mocks.getCatalogForUserV2,
  // Mirror the real projection shape closely enough to assert the mapping.
  toLearnHubCards: (
    courses: { course: { series_slug: string }; canAccess: boolean; lessonSlugs?: string[] }[],
    opts: { includeLessonSlugs?: boolean } = {},
  ) =>
    courses.map((c) => ({
      slug: c.course.series_slug,
      name: c.course.series_slug,
      description: "",
      gradient: "",
      lessonCount: 3,
      totalLessons: 3,
      lessonSlugs: opts.includeLessonSlugs ? (c.lessonSlugs ?? []) : [],
      section: null,
      group: null,
      track: null,
      level: null,
      sortOrder: 0,
      difficulty: null,
      canAccess: c.canAccess,
    })),
}));

import { GET } from "./route";

const catalog = {
  isAdmin: false,
  courses: [
    {
      course: { series_slug: "agentic-ai" },
      canAccess: true,
      lessonSlugs: ["agentic-ai-1", "agentic-ai-2"],
    },
    {
      course: { series_slug: "hermes-consultant" },
      canAccess: false,
      lessonSlugs: ["hermes-consultant-1"],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUser.mockResolvedValue(null);
  mocks.getCatalogForUserV2.mockResolvedValue(catalog);
});

describe("GET /api/atlas/cards", () => {
  it("returns an empty guest projection and never reads the catalogue for guests", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ gate: "guest-locked", series: [] });
    expect(mocks.getCatalogForUserV2).not.toHaveBeenCalled();
  });

  it("returns the signed-in per-series delta with the user id", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "u1", email: "jane@adroit.io", name: null });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      gate: "signed-in",
      series: [
        { slug: "agentic-ai", canAccess: true, lessonSlugs: ["agentic-ai-1", "agentic-ai-2"] },
        { slug: "hermes-consultant", canAccess: false, lessonSlugs: ["hermes-consultant-1"] },
      ],
    });
    expect(mocks.getCatalogForUserV2).toHaveBeenCalledWith("u1");
  });

  it("is never cached (per-session payload)", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "u1", email: "jane@adroit.io", name: null });
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 503 (guest baseline, no false upgrade) when the catalogue read fails", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "u1", email: "jane@adroit.io", name: null });
    mocks.getCatalogForUserV2.mockRejectedValue(new Error("db down"));

    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ gate: "guest-locked", series: [] });
  });

  it("treats a broken auth backend as a guest instead of throwing", async () => {
    mocks.getSessionUser.mockRejectedValue(new Error("auth unreachable"));

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ gate: "guest-locked", series: [] });
  });
});
