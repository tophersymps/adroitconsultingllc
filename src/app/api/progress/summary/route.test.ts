/**
 * route.test.ts — GET /api/progress/summary entitlement filter (t_10214e52).
 *
 * Summary returns the caller's own rows, but course-scoped progress
 * (completed lessons + lesson reads) is filtered through the access seam so a
 * user who no longer has access to a gated course doesn't see their progress
 * in it. Blog reads are never course-gated and always return.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const getSupabaseServerClient = vi.fn();
  const getUser = vi.fn();
  const from = vi.fn();
  const decideCourseAccess = vi.fn();
  return {
    mocks: { getSupabaseServerClient, getUser, from, decideCourseAccess },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));

vi.mock("@/lib/access", () => ({
  accessSeam: { decideCourseAccess: mocks.decideCourseAccess },
}));

import { GET } from "./route";

const LESSON_SLUG =
  "day-01-f1-omnistudio-solution-and-industry-use-cases"; // omni-studio-cert

function makeFrom(table: string) {
  // read_progress → blog + lesson rows; lesson_completion → lesson_slug rows.
  const data =
    table === "read_progress"
      ? [
          { content_type: "blog", content_slug: "blog/hello-world" },
          { content_type: "lesson", content_slug: `lesson/${LESSON_SLUG}` },
        ]
      : [{ lesson_slug: LESSON_SLUG }];
  return {
    select: () => ({
      eq: async () => ({ data, error: null }),
    }),
  };
}

function authed(id = "user-1") {
  mocks.getUser.mockResolvedValue({ data: { user: { id } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.decideCourseAccess.mockResolvedValue({ kind: "granted" });
  mocks.from.mockImplementation((table: string) => makeFrom(table));
});

describe("GET /api/progress/summary — entitlement filter (t_10214e52)", () => {
  it("keeps blog + lesson progress for accessible courses", async () => {
    authed();
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.readContent.blog).toEqual(["blog/hello-world"]);
    expect(json.readContent.lesson).toEqual([`lesson/${LESSON_SLUG}`]);
    expect(json.completedLessons).toEqual([LESSON_SLUG]);
  });

  it("drops lesson progress (read + completed) for a gated course but keeps blog", async () => {
    authed();
    mocks.decideCourseAccess.mockResolvedValue({ kind: "paywall" });
    const res = await GET();
    const json = await res.json();
    // Blog is not course-gated — always kept.
    expect(json.readContent.blog).toEqual(["blog/hello-world"]);
    // Lesson progress in the paywalled course is filtered out.
    expect(json.readContent.lesson).toEqual([]);
    expect(json.completedLessons).toEqual([]);
  });

  it("returns empty for guests (no data leak)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    const json = await res.json();
    expect(json).toEqual({
      readContent: { blog: [], lesson: [] },
      completedLessons: [],
    });
  });
});
