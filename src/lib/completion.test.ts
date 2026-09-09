/**
 * src/lib/completion.test.ts — Learn v2 completion derivation (plan §3f).
 *
 * deriveProgress is pure and unit-testable without a DB: lessons/courses/tracks
 * completed, streaks, and time-to-complete from the append-only event log.
 */
import { describe, expect, it } from "vitest";
import { deriveProgress, deriveRank, RANK_LADDER } from "@/lib/completion";
import type { CompletionEventRow } from "@/shared/contracts-course-catalog";

const NOW = "2026-08-27T12:00:00.000Z";

function ev(over: Partial<CompletionEventRow> = {}): CompletionEventRow {
  return {
    id: 1,
    user_id: "u1",
    course_id: null,
    event_type: "lesson",
    lesson: null,
    lesson_slug: null,
    completed_at: NOW,
    ...over,
  };
}

describe("deriveProgress", () => {
  it("counts distinct lessons + course completions + tracks", () => {
    const result = deriveProgress({
      now: NOW,
      courseTracks: {
        c1: "track-a",
        c2: "track-a",
        c3: "track-b",
      },
      events: [
        ev({ event_type: "lesson", lesson_slug: "l1" }),
        ev({ event_type: "lesson", lesson_slug: "l1" }), // dup → still 1 lesson
        ev({ event_type: "lesson", lesson_slug: "l2" }),
        ev({ event_type: "course", course_id: "c1" }),
        ev({ event_type: "course", course_id: "c2" }), // track-a complete
        ev({ event_type: "course", course_id: "c3" }), // track-b complete
      ],
    });
    expect(result.lessonsCompleted).toBe(2);
    expect(result.coursesCompleted).toBe(3);
    expect(result.tracksCompleted).toBe(2);
  });

  it("track not complete when one of its courses is missing a course event", () => {
    const result = deriveProgress({
      now: NOW,
      courseTracks: { c1: "track-a", c2: "track-a" },
      events: [ev({ event_type: "course", course_id: "c1" })],
    });
    expect(result.tracksCompleted).toBe(0);
  });

  it("computes current + longest streak over consecutive days", () => {
    const result = deriveProgress({
      now: "2026-08-27T12:00:00.000Z",
      courseTracks: {},
      events: [
        ev({ completed_at: "2026-08-25T10:00:00.000Z" }),
        ev({ completed_at: "2026-08-26T10:00:00.000Z" }),
        ev({ completed_at: "2026-08-27T09:00:00.000Z" }),
        // a separate earlier run of 2 days
        ev({ completed_at: "2026-08-20T09:00:00.000Z" }),
        ev({ completed_at: "2026-08-21T09:00:00.000Z" }),
      ],
    });
    expect(result.streakDays).toBe(3);
    expect(result.longestStreakDays).toBe(3);
  });

  it("longest streak beats current streak", () => {
    // A 3-day run, then a gap, then yesterday (B-19: streak alive at 08-26,
    // the day before `now`). Current streak resets to 1 after the gap while
    // the historical longest stays 3.
    const result = deriveProgress({
      now: "2026-08-27T12:00:00.000Z",
      courseTracks: {},
      events: [
        ev({ completed_at: "2026-08-20T09:00:00.000Z" }),
        ev({ completed_at: "2026-08-21T09:00:00.000Z" }),
        ev({ completed_at: "2026-08-22T09:00:00.000Z" }),
        ev({ completed_at: "2026-08-26T09:00:00.000Z" }), // yesterday → alive
      ],
    });
    expect(result.longestStreakDays).toBe(3);
    expect(result.streakDays).toBe(1);
  });

  it("streak is 0 when the most recent completion is neither today nor yesterday (B-19 bug fix)", () => {
    // Last event is 3 days before `now` — the streak has broken and must reset
    // to 0 even though there was an active run earlier. `now` was previously
    // accepted but UNUSED; it now gates whether the current streak is alive.
    const result = deriveProgress({
      now: "2026-08-27T12:00:00.000Z",
      courseTracks: {},
      events: [
        ev({ completed_at: "2026-08-24T09:00:00.000Z" }), // 3 days before now
        ev({ completed_at: "2026-08-25T09:00:00.000Z" }), // 2 days before now
      ],
    });
    expect(result.streakDays).toBe(0);
    expect(result.longestStreakDays).toBe(2); // historical best is unchanged
  });

  it("streak counts when the most recent completion is yesterday (B-19)", () => {
    // Real gap: 08-24 (2 days before the 08-26 yesterday event is a break),
    // so the live streak is exactly 1.
    const result = deriveProgress({
      now: "2026-08-27T12:00:00.000Z",
      courseTracks: {},
      events: [
        ev({ completed_at: "2026-08-24T09:00:00.000Z" }), // gap (not consecutive)
        ev({ completed_at: "2026-08-26T09:00:00.000Z" }), // yesterday
      ],
    });
    expect(result.streakDays).toBe(1);
  });

  it("streak counts consecutive days ending today", () => {
    const result = deriveProgress({
      now: "2026-08-27T12:00:00.000Z",
      courseTracks: {},
      events: [
        ev({ completed_at: "2026-08-25T09:00:00.000Z" }),
        ev({ completed_at: "2026-08-26T09:00:00.000Z" }),
        ev({ completed_at: "2026-08-27T09:00:00.000Z" }), // today
      ],
    });
    expect(result.streakDays).toBe(3);
  });

  it("time-to-complete is the whole-day span across events; null under 2 events", () => {
    const span = deriveProgress({
      now: NOW,
      courseTracks: {},
      events: [
        ev({ completed_at: "2026-08-01T09:00:00.000Z" }),
        ev({ completed_at: "2026-08-10T09:00:00.000Z" }),
      ],
    });
    expect(span.timeToCompleteDays).toBe(9);

    const single = deriveProgress({
      now: NOW,
      courseTracks: {},
      events: [ev({ completed_at: "2026-08-01T09:00:00.000Z" })],
    });
    expect(single.timeToCompleteDays).toBeNull();
  });

  it("empty event set → zeros, null time-to-complete, and starseed rank (floor)", () => {
    const result = deriveProgress({ now: NOW, courseTracks: {}, events: [] });
    expect(result).toEqual({
      lessonsCompleted: 0,
      coursesCompleted: 0,
      tracksCompleted: 0,
      streakDays: 0,
      longestStreakDays: 0,
      timeToCompleteDays: null,
      rank: expect.objectContaining({ id: "starseed", index: 0 }),
    });
  });

  it("includes the derived rank (highest reached band)", () => {
    // 20 lessons + 2 courses → explorer (index 2).
    const result = deriveProgress({
      now: NOW,
      courseTracks: { c1: "a", c2: "a" },
      events: [
        ...Array.from({ length: 20 }, (_, i) =>
          ev({ event_type: "lesson", lesson_slug: `l${i}` }),
        ),
        ev({ event_type: "course", course_id: "c1" }),
        ev({ event_type: "course", course_id: "c2" }),
      ],
    });
    expect(result.rank?.id).toBe("explorer");
    expect(result.rank?.index).toBe(2);
  });

  it("rank stays at the highest band whose lessons AND courses thresholds are met", () => {
    // 20 lessons but only 1 course → explorer requires 2 courses, so stays at
    // wayfarer (index 1).
    const result = deriveProgress({
      now: NOW,
      courseTracks: {},
      events: [
        ...Array.from({ length: 20 }, (_, i) =>
          ev({ event_type: "lesson", lesson_slug: `l${i}` }),
        ),
        ev({ event_type: "course", course_id: "c1" }),
      ],
    });
    expect(result.rank?.id).toBe("wayfarer");
  });

  it("deriveRank picks the top band once all thresholds are met", () => {
    expect(deriveRank(0, 0)?.id).toBe("starseed");
    expect(deriveRank(5, 0)?.id).toBe("wayfarer");
    expect(deriveRank(20, 2)?.id).toBe("explorer");
    expect(deriveRank(50, 4)?.id).toBe("polestar");
    expect(deriveRank(100, 8)?.id).toBe("celestial");
    expect(deriveRank(500, 50)?.id).toBe("celestial");
  });

  it("nextProgressPct is 100 at the top band and finite below it", () => {
    const top = deriveRank(100, 8);
    expect(top?.nextProgressPct).toBe(100);

    const mid = deriveRank(20, 2); // explorer, toward polestar (50/4)
    expect(mid?.nextProgressPct).toBeGreaterThan(0);
    expect(mid?.nextProgressPct).toBeLessThanOrEqual(100);

    expect(RANK_LADDER.length).toBeGreaterThanOrEqual(5);
  });
});
