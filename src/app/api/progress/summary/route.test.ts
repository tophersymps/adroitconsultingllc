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

vi.mock("@/lib/db/server", () => ({
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
  // read_progress → blog + lesson rows; lesson_completion → lesson_slug rows;
  // quiz_run → one row per completed run (PERF t_22e18719 payload).
  let data: unknown[];
  if (table === "read_progress") {
    data = [
      { content_type: "blog", content_slug: "blog/hello-world" },
      { content_type: "lesson", content_slug: `lesson/${LESSON_SLUG}` },
    ];
  } else if (table === "quiz_run") {
    data = [
      { quiz_name: "omni-studio-cert", score: 60 },
      { quiz_name: "omni-studio-cert", score: 82 },
      { quiz_name: "agentic-ai", score: 95 },
    ];
  } else {
    data = [{ lesson_slug: LESSON_SLUG }];
  }
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
      quizStats: {},
    });
  });
});

/**
 * PERF t_22e18719 — the signed-in /atlas hub used to issue one
 * GET /api/progress/quiz/run per card for these numbers. They now ship with the
 * single summary read, so the aggregate has to be exactly what that route
 * returned: MAX(score) and the completed-run count, course-gated the same way.
 */
describe("GET /api/progress/summary — quizStats aggregate (PERF t_22e18719)", () => {
  it("aggregates best score + attempt count per quiz for accessible courses", async () => {
    authed();
    const json = await (await GET()).json();
    expect(json.quizStats["omni-studio-cert"]).toEqual({ bestScore: 82, attempts: 2 });
    expect(json.quizStats["agentic-ai"]).toEqual({ bestScore: 95, attempts: 1 });
  });

  it("drops quiz stats for a course the user can no longer access", async () => {
    authed();
    mocks.decideCourseAccess.mockImplementation(async (_userId: string, series: string) =>
      series === "omni-studio-cert" ? { kind: "paywall" } : { kind: "granted" },
    );
    const json = await (await GET()).json();
    expect(json.quizStats["omni-studio-cert"]).toBeUndefined();
    expect(json.quizStats["agentic-ai"]).toEqual({ bestScore: 95, attempts: 1 });
  });

  it("fails closed when the access seam throws", async () => {
    authed();
    mocks.decideCourseAccess.mockRejectedValue(new Error("seam down"));
    const json = await (await GET()).json();
    expect(json.quizStats).toEqual({});
  });

  it("ignores malformed quiz_run rows instead of poisoning the payload", async () => {
    authed();
    const base = mocks.from.getMockImplementation()!;
    mocks.from.mockImplementation((table: string) => {
      if (table !== "quiz_run") return base(table);
      return {
        select: () => ({
          eq: async () => ({
            data: [
              { quiz_name: "agentic-ai", score: 70 },
              { quiz_name: null, score: 50 },
              { quiz_name: "agentic-ai", score: "oops" },
            ],
            error: null,
          }),
        }),
      };
    });
    const json = await (await GET()).json();
    expect(json.quizStats).toEqual({ "agentic-ai": { bestScore: 70, attempts: 1 } });
  });
});

/**
 * SEC-R2-F2 (t_2dd0e9f9) — the per-user payload must never be stored by the
 * browser or a shared intermediary. The client passes `cache: "no-store"`, but
 * a proxy in front of the app is not party to that.
 */
describe("GET /api/progress/summary — cache headers (SEC-R2-F2 t_2dd0e9f9)", () => {
  it("marks the authenticated payload private and no-store", async () => {
    authed();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("marks the guest payload private and no-store", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("marks the fail-closed 500 payload no-store", async () => {
    mocks.getUser.mockRejectedValue(new Error("auth down"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
