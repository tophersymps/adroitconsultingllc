/**
 * sky-server.loadProfileSky — deep-sky v1.2.0 AC-5 regression (sync bug).
 *
 * ROOT CAUSE the sync bug (reported against deep-sky): the on-course tracker
 * /learn/[series] lit lessons from lesson_completion (mutable current state),
 * but loadProfileSky derived lit stars from completion_events (the append-only
 * historical log). Because an "unmark" DELETES the lesson_completion row but
 * deliberately KEEPS the immutable lesson event, an unmarked lesson stayed lit
 * on the profile sky forever while the tracker showed it done only once.
 *
 * FIX under test: loadProfileSky now sources completedSlugs from
 * getCompletedLessonSlugs (lesson_completion) — the SAME single source of
 * truth as the tracker. This test drives the divergence that used to trigger
 * the bug (a stale lesson event with NO current lesson_completion row) and
 * asserts the star is NOT lit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const dataByTable: Record<string, unknown[]> = {};
  const mockData = (table: string, rows: unknown[]) => {
    dataByTable[table] = rows;
  };
  return { mocks: { mockData, dataByTable } };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => {
    // from(table) returns rows for that table; select(...).eq/not chains resolve.
    return {
      from: (table: string) => {
        const rows = mocks.dataByTable[table] ?? [];
        const eq = () => selectResolve(rows);
        const select = () => ({ eq, not: () => selectResolve(rows) });
        return { select };
      },
    };
  },
}));

function selectResolve(rows: unknown[]) {
  return { data: rows, error: null };
}

vi.mock("@/lib/learn", () => ({
  getLessonsForSeries: (slug: string) =>
    slug === "agentic-ai"
      ? [
          { slug: "l1", title: "Lesson 1" },
          { slug: "l2", title: "Lesson 2" },
        ]
      : [],
  getSeriesBySlug: (slug: string) =>
    slug === "agentic-ai" ? { slug, name: "Agentic AI" } : null,
}));

vi.mock("@/lib/certificate", () => ({
  getSeriesLessonSlugs: () => [],
}));

vi.mock("@/lib/catalog", () => ({
  getCatalogForUserV2: async () => ({
    courses: [
      {
        slug: "agentic-ai",
        course: { series_slug: "agentic-ai", track: null, level: null, sort_order: 1, difficulty: "Beginner" },
        name: "Agentic AI",
        description: "",
        gradient: "from-x to-y",
        lessonCount: 2,
        totalLessons: 2,
        canAccess: true,
        section: null,
        group: null,
      },
    ],
    admin: false,
  }),
  toLearnHubCards: (courses: { slug: string; name: string; description: string; gradient: string }[]) =>
    courses.map((c) => ({
      slug: c.slug,
      name: c.name,
      description: c.description,
      gradient: c.gradient,
      lessonCount: 2,
      totalLessons: 2,
      lessonSlugs: [],
      section: null,
      group: null,
      track: null,
      level: null,
      sortOrder: 1,
      difficulty: "Beginner",
      canAccess: true,
    })),
}));

import { loadProfileSky } from "./sky-server";

beforeEach(() => {
  mocks.dataByTable["lesson_completion"] = [];
  mocks.dataByTable["completion_events"] = [];
  mocks.dataByTable["courses"] = [];
});

describe("loadProfileSky — constellation lighting single source of truth (AC-5)", () => {
  it("does NOT light a lesson that has a stale event but no lesson_completion row", async () => {
    // Divergence that triggered the bug: a lesson was marked then UNMARKED.
    // DELETE removed the lesson_completion row but the immutable lesson event
    // survived (unmark never deletes events). Old code lit l1 from the event.
    mocks.dataByTable["completion_events"] = [
      {
        id: 1,
        user_id: "u1",
        course_id: "agentic-ai",
        event_type: "lesson",
        lesson: 1,
        lesson_slug: "l1",
        completed_at: "2026-09-01T12:00:00.000Z",
        metadata: null,
      },
    ];
    // l1 has NO current completion row → must NOT be lit.
    mocks.dataByTable["lesson_completion"] = [
      { user_id: "u1", lesson_slug: "l2" },
    ];

    const sky = await loadProfileSky("u1");
    const constel = sky.constellations.find((c) => c.seriesSlug === "agentic-ai");
    expect(constel).toBeTruthy();
    const l1 = constel!.stars.find((s) => s.lessonSlug === "l1");
    const l2 = constel!.stars.find((s) => s.lessonSlug === "l2");
    expect(l1!.lit).toBe(false); // stale event must NOT light it
    expect(l2!.lit).toBe(true); // current row lights it
  });

  it("lights lessons that have a current lesson_completion row", async () => {
    mocks.dataByTable["lesson_completion"] = [
      { user_id: "u1", lesson_slug: "l1" },
      { user_id: "u1", lesson_slug: "l2" },
    ];
    const sky = await loadProfileSky("u1");
    const constel = sky.constellations.find((c) => c.seriesSlug === "agentic-ai");
    expect(constel!.litStars).toBe(2);
    expect(constel!.complete).toBe(true);
  });
});
