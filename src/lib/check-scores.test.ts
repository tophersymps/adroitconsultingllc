/**
 * check-scores.test.ts — the authoritative per-check verdict (A6).
 *
 * Pins the contract the exam gate and the lesson page both depend on:
 * one query, canonical-coverage scoring, 80% threshold, and a read failure that
 * never throws (an unreadable attempt set is "not passed", not a 500).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { totals } = vi.hoisted(() => ({
  /** check number → canonical question count (undefined = no check document). */
  totals: new Map<number, number>(),
}));

vi.mock("@/lib/quiz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz")>();
  return {
    ...actual,
    getKnowledgeCheck: (series: string, n: number) => {
      const total = totals.get(n);
      if (total === undefined) return null;
      return {
        series,
        quizName: `${series}:check:${n}`,
        questions: Array.from({ length: total }, (_, i) => ({
          question: `q${i}`,
          options: ["a", "b"],
        })),
      };
    },
  };
});

import {
  checkQuizName,
  loadCheckScore,
  loadCheckScores,
  type CheckScore,
} from "./check-scores";

interface AttemptRow {
  quiz_name: string;
  question_index: number;
  is_correct: boolean;
}

const SERIES = "ai-at-work";
const USER = "user-1";

/** Minimal supabase stub: records the query spec and returns the given rows. */
function fakeSupabase(rows: AttemptRow[], options: { error?: boolean } = {}) {
  const queries: {
    table: string;
    select?: string;
    eq?: [string, unknown];
    in?: [string, unknown[]];
  }[] = [];
  const client = {
    from(table: string) {
      const spec: (typeof queries)[number] = { table };
      queries.push(spec);
      const builder = {
        select(columns: string) {
          spec.select = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          spec.eq = [column, value];
          return builder;
        },
        in(column: string, values: unknown[]) {
          spec.in = [column, values];
          return Promise.resolve(
            options.error
              ? { data: null, error: { message: "boom" } }
              : { data: rows, error: null },
          );
        },
      };
      return builder;
    },
  };
  return { client: client as never, queries };
}

/** `correct` of `total` questions answered correctly, full coverage. */
function fullAttempt(series: string, n: number, total: number, correct: number): AttemptRow[] {
  return Array.from({ length: total }, (_, index) => ({
    quiz_name: `${series}:check:${n}`,
    question_index: index,
    is_correct: index < correct,
  }));
}

beforeEach(() => {
  totals.clear();
});

describe("loadCheckScores — every check, one query", () => {
  it("returns best score and pass verdict per check, keyed by check number", async () => {
    totals.set(1, 10);
    totals.set(2, 10);
    const { client, queries } = fakeSupabase([
      ...fullAttempt(SERIES, 1, 10, 8), // 80% → pass
      ...fullAttempt(SERIES, 2, 10, 7), // 70% → fail
    ]);

    const scores = await loadCheckScores(client, USER, SERIES, [
      { n: 1, lessons: [1, 5] },
      { n: 2, lessons: [6, 10] },
    ]);

    expect(scores.get(1)).toEqual<CheckScore>({ bestScore: 80, passed: true });
    expect(scores.get(2)).toEqual<CheckScore>({ bestScore: 70, passed: false });

    // One query, filtered to this user and to this series' check quiz names.
    expect(queries).toHaveLength(1);
    expect(queries[0]!.table).toBe("quiz_attempt");
    expect(queries[0]!.select).toBe("quiz_name, question_index, is_correct");
    expect(queries[0]!.eq).toEqual(["user_id", USER]);
    expect(queries[0]!.in).toEqual([
      "quiz_name",
      [`${SERIES}:check:1`, `${SERIES}:check:2`],
    ]);
  });

  it("pins the 80% boundary exactly (79 fails, 80 passes)", async () => {
    totals.set(1, 100);
    const at80 = fakeSupabase(fullAttempt(SERIES, 1, 100, 80));
    const at79 = fakeSupabase(fullAttempt(SERIES, 1, 100, 79));

    expect((await loadCheckScores(at80.client, USER, SERIES, [{ n: 1, lessons: [1, 5] }])).get(1))
      .toMatchObject({ passed: true });
    expect((await loadCheckScores(at79.client, USER, SERIES, [{ n: 1, lessons: [1, 5] }])).get(1))
      .toMatchObject({ bestScore: 79, passed: false });
  });

  it("never scores a partial attempt set (8 of 15 correct is not 100%)", async () => {
    totals.set(1, 15);
    const { client } = fakeSupabase(fullAttempt(SERIES, 1, 15, 8).slice(0, 8));

    const scores = await loadCheckScores(client, USER, SERIES, [{ n: 1, lessons: [1, 5] }]);
    expect(scores.get(1)).toEqual<CheckScore>({ bestScore: 0, passed: false });
  });

  it("a check with no rows reads as not passed", async () => {
    totals.set(1, 5);
    const { client } = fakeSupabase([]);
    expect((await loadCheckScores(client, USER, SERIES, [{ n: 1, lessons: [1, 5] }])).get(1))
      .toEqual<CheckScore>({ bestScore: 0, passed: false });
  });

  it("a check with no canonical document can never be scored", async () => {
    // totals has no entry for check 1 → getKnowledgeCheck returns null.
    const { client } = fakeSupabase(fullAttempt(SERIES, 1, 5, 5));
    expect((await loadCheckScores(client, USER, SERIES, [{ n: 1, lessons: [1, 5] }])).get(1))
      .toEqual<CheckScore>({ bestScore: 0, passed: false });
  });

  it("a read failure is 'not passed', never a throw", async () => {
    totals.set(1, 5);
    const { client } = fakeSupabase([], { error: true });
    const scores = await loadCheckScores(client, USER, SERIES, [{ n: 1, lessons: [1, 5] }]);
    expect(scores.get(1)).toEqual<CheckScore>({ bestScore: 0, passed: false });
  });

  it("a series with no checks issues no query", async () => {
    const { client, queries } = fakeSupabase([]);
    const scores = await loadCheckScores(client, USER, SERIES, []);
    expect(scores.size).toBe(0);
    expect(queries).toHaveLength(0);
  });
});

describe("loadCheckScore — one check, one query (lesson page)", () => {
  it("asks only for the covering check's quiz name", async () => {
    totals.set(1, 10);
    const { client, queries } = fakeSupabase(fullAttempt(SERIES, 1, 10, 9));

    const score = await loadCheckScore(client, USER, SERIES, 1);

    expect(score).toEqual<CheckScore>({ bestScore: 90, passed: true });
    expect(queries).toHaveLength(1);
    expect(queries[0]!.in).toEqual(["quiz_name", [`${SERIES}:check:1`]]);
  });

  it("ignores rows for a different check of the same series", async () => {
    totals.set(1, 4);
    const { client } = fakeSupabase([
      ...fullAttempt(SERIES, 1, 4, 2),
      ...fullAttempt(SERIES, 2, 4, 4),
    ]);

    expect(await loadCheckScore(client, USER, SERIES, 1)).toEqual<CheckScore>({
      bestScore: 50,
      passed: false,
    });
  });

  it("names the quiz canonically", () => {
    expect(checkQuizName("omni-studio-cert", 4)).toBe("omni-studio-cert:check:4");
  });
});
