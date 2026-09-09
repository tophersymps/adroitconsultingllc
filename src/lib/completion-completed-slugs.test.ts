/**
 * completion-completed-slugs.test.ts — getCompletedLessonSlugs (deep-sky v1.2.0 AC-5).
 *
 * The on-course tracker /learn/[series] AND the profile sky must light a
 * lesson's star from the SAME current-state source. Root cause of the sync
 * bug: the learn page read lesson_completion (the mutable current-state store)
 * while the profile derived completed lessons from completion_events (the
 * append-only historical log). Because DELETE /api/progress/lesson removes the
 * lesson_completion row but intentionally keeps the immutable event, an
 * unmarked lesson stayed "lit" on the profile sky forever.
 *
 * The fix: both surfaces call getCompletedLessonSlugs(userId), which reads
 * lesson_completion. This test locks that helper's contract (it reads the
 * current-state store, never the event log).
 *
 * Kept separate from completion.test.ts (which covers the pure deriveProgress/
 * deriveRank derivation) because this helper talks to Supabase.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const select = vi.fn();
  const eq = vi.fn();
  return { mocks: { select, eq } };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    from: (table: string) => {
      if (table !== "lesson_completion") {
        throw new Error(`unexpected table: ${table}`);
      }
      return { select: mocks.select };
    },
  }),
}));

import { getCompletedLessonSlugs } from "./completion";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReset();
  mocks.eq.mockReset();
});

describe("getCompletedLessonSlugs", () => {
  it("reads the CURRENT set from lesson_completion (single source of truth)", async () => {
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({
      data: [{ lesson_slug: "l1" }, { lesson_slug: "l2" }],
      error: null,
    });

    const slugs = await getCompletedLessonSlugs("user-1");
    expect(mocks.select).toHaveBeenCalledWith("lesson_slug");
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect([...slugs].sort()).toEqual(["l1", "l2"]);
  });

  it("returns an empty set when the user has no completion rows", async () => {
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ data: [], error: null });

    const slugs = await getCompletedLessonSlugs("user-1");
    expect(slugs.size).toBe(0);
  });

  it("degrades to empty (never throws) when the DB read fails", async () => {
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ data: null, error: { message: "boom" } });

    const slugs = await getCompletedLessonSlugs("user-1");
    expect(slugs.size).toBe(0);
  });
});
