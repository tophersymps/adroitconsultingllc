/**
 * lesson-checks.test.ts — lesson ↔ knowledge-check mapping (A3).
 *
 * Contract: deliverables/learn-ux-exam-naming/api-contracts.md §B.1
 * Decisions: ADR-303 (position from the check file's resolved range, never `5n`),
 *            ADR-304 / architecture.md §4 (no gating, no "locked" state).
 *
 * The suite pins:
 *  - interleaving for 5-lesson, 8-lesson and short-tail cadences (`ai-at-work` 6
 *    checks, `sf-omni-consultant` 12 checks, `agentic-ai` 8-lesson ranges);
 *  - touching / overlapping / same-end ranges, unpublished range ends, checks
 *    before lesson 1 or past the published tail, series with no checks;
 *  - `?sort=desc` reversal travelling with the nodes;
 *  - `checkState` returning only "passed" | "available" with no mode parameter;
 *  - fail-loud behaviour for a check with no resolved range (no `5n` recompute);
 *  - input conformance: all 90 `check-*.json` titles carry a `Lessons A–B`
 *    range, so `quiz.ts`'s dormant `5n` fallback can never move a node today.
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { LearnLesson } from "@/data/types";
import type { KnowledgeCheckMeta } from "@/shared/contracts";

import {
  buildTimeline,
  checkCovering,
  checkEndingAt,
  checkState,
  hiddenByFilter,
  nextLessonAfter,
  type TimelineNode,
} from "./lesson-checks";
import { getKnowledgeChecks } from "./quiz";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

/** vitest runs from the repo root (jsdom env — `import.meta.url` is not a file URL). */
const REPO_ROOT = process.cwd();
const LEARN_ROOT = path.join(REPO_ROOT, "content", "learn");

function lesson(n: number, series = "test-series"): LearnLesson {
  return {
    slug: `lesson-${n}`,
    title: `Lesson ${n}`,
    series,
    lesson: n,
    excerpt: "",
    date: "Date unknown",
    author: "Adroit Consulting",
    readTime: "5 min read",
    tags: [],
    status: "published",
  };
}

/** Lessons numbered `from`..`to` inclusive. */
function lessonRange(from: number, to: number, series = "test-series"): LearnLesson[] {
  const out: LearnLesson[] = [];
  for (let n = from; n <= to; n += 1) out.push(lesson(n, series));
  return out;
}

function check(n: number, a: number, b: number): KnowledgeCheckMeta {
  return { n, lessons: [a, b] };
}

/** Compact shape of a node list: `L1 L2 … K1` (lesson number / check number). */
function shape(nodes: readonly TimelineNode[]): string {
  return nodes
    .map((node) => (node.kind === "lesson" ? `L${node.lesson.lesson}` : `K${node.check.n}`))
    .join(" ");
}

function indexOfNode(nodes: readonly TimelineNode[], token: string): number {
  return shape(nodes).split(" ").indexOf(token);
}

function seriesLessonCount(series: string): number {
  return fs
    .readdirSync(path.join(LEARN_ROOT, series))
    .filter((file) => file.endsWith(".mdx")).length;
}

const CHECK_SERIES = fs
  .readdirSync(LEARN_ROOT)
  .filter((dir) => fs.existsSync(path.join(LEARN_ROOT, dir, "checks")));

/* ------------------------------------------------------------------ */
/*  buildTimeline — placement                                           */
/* ------------------------------------------------------------------ */

describe("buildTimeline — placement", () => {
  it("puts each check immediately after its range end (5-lesson cadence)", () => {
    const nodes = buildTimeline(lessonRange(1, 10), [check(1, 1, 5), check(2, 6, 10)]);
    expect(shape(nodes)).toBe("L1 L2 L3 L4 L5 K1 L6 L7 L8 L9 L10 K2");
  });

  it("is total: exactly lessons.length + checks.length nodes", () => {
    const lessons = lessonRange(1, 10);
    const checks = [check(1, 1, 5), check(2, 6, 10)];
    expect(buildTimeline(lessons, checks)).toHaveLength(12);
    expect(buildTimeline(lessons, [])).toHaveLength(10);
    expect(buildTimeline([], checks)).toHaveLength(2);
    expect(buildTimeline([], [])).toHaveLength(0);
  });

  it("handles a short-tail final range (range end == last lesson, not a multiple of 5)", () => {
    const nodes = buildTimeline(lessonRange(1, 34), [
      check(7, 31, 34),
      check(6, 26, 30),
    ]);
    expect(shape(nodes)).toBe(
      "L1 L2 L3 L4 L5 L6 L7 L8 L9 L10 L11 L12 L13 L14 L15 L16 L17 L18 L19 L20 L21 L22 L23 L24 L25 " +
        "L26 L27 L28 L29 L30 K6 L31 L32 L33 L34 K7",
    );
  });

  it("never derives position from 5n — an 8-lesson cadence lands on lesson 16", () => {
    const checks = [check(1, 1, 8), check(2, 9, 16), check(3, 17, 24)];
    const nodes = buildTimeline(lessonRange(1, 24), checks);
    expect(shape(nodes)).toBe(
      "L1 L2 L3 L4 L5 L6 L7 L8 K1 L9 L10 L11 L12 L13 L14 L15 L16 K2 " +
        "L17 L18 L19 L20 L21 L22 L23 L24 K3",
    );
    // A `5n` placement would have put check 2 after lesson 10, nine rows early.
    expect(indexOfNode(nodes, "L16")).toBe(indexOfNode(nodes, "K2") - 1);
    expect(indexOfNode(nodes, "K2")).toBeGreaterThan(indexOfNode(nodes, "L10"));
  });

  it("renders touching ranges (end of one == start of the next) at their own ends", () => {
    const nodes = buildTimeline(lessonRange(1, 10), [check(1, 1, 5), check(2, 5, 10)]);
    expect(shape(nodes)).toBe("L1 L2 L3 L4 L5 K1 L6 L7 L8 L9 L10 K2");
  });

  it("renders overlapping ranges in n order at their own end positions", () => {
    const nodes = buildTimeline(lessonRange(1, 10), [check(1, 1, 6), check(2, 5, 10)]);
    expect(shape(nodes)).toBe("L1 L2 L3 L4 L5 L6 K1 L7 L8 L9 L10 K2");
  });

  it("stacks checks that share an end lesson in n order after that lesson", () => {
    const nodes = buildTimeline(lessonRange(1, 8), [check(2, 5, 8), check(1, 1, 8)]);
    expect(shape(nodes)).toBe("L1 L2 L3 L4 L5 L6 L7 L8 K1 K2");
  });

  it("renders a check whose range end is unpublished after the last published lesson of the range", () => {
    const nodes = buildTimeline(lessonRange(1, 7), [check(1, 1, 10)]);
    expect(shape(nodes)).toBe("L1 L2 L3 L4 L5 L6 L7 K1");
    // It never claims lessons 8–10 exist.
    expect(shape(nodes)).not.toContain("L8");
  });

  it("anchors an unpublished gap range end on the last published lesson at or below it", () => {
    // Lessons 6–8 are not published yet; check 2 covers 6–8 and its range END
    // (lessons[1] === 8) does not exist, so the node lands after lesson 5 — the
    // last published lesson at or below the range end. It never claims L6–L8.
    const lessons = [...lessonRange(1, 5), ...lessonRange(9, 10)];
    const nodes = buildTimeline(lessons, [check(2, 6, 8)]);
    expect(shape(nodes)).toBe("L1 L2 L3 L4 L5 K2 L9 L10");
    expect(nodes).toHaveLength(lessons.length + 1);
  });

  it("renders a check entirely past the published tail at the end, in n order", () => {
    const nodes = buildTimeline(lessonRange(1, 7), [check(3, 21, 25), check(2, 8, 10)]);
    expect(shape(nodes)).toBe("L1 L2 L3 L4 L5 L6 L7 K2 K3");
  });

  it("renders a check whose range ends before lesson 1 at the end, without crashing", () => {
    // Lessons 1–5 have not been published yet; the series starts at lesson 6.
    const nodes = buildTimeline(lessonRange(6, 10), [check(1, 1, 5)]);
    expect(shape(nodes)).toBe("L6 L7 L8 L9 L10 K1");
    expect(nodes).toHaveLength(6);
  });

  it("emits no check nodes for a series with no checks", () => {
    const nodes = buildTimeline(lessonRange(1, 4), []);
    expect(shape(nodes)).toBe("L1 L2 L3 L4");
    expect(nodes.every((node) => node.kind === "lesson")).toBe(true);
  });

  it("emits only check nodes when no lesson is published", () => {
    const nodes = buildTimeline([], [check(1, 1, 5), check(2, 6, 10)]);
    expect(shape(nodes)).toBe("K1 K2");
  });

  it("is order-independent and does not mutate its inputs", () => {
    const lessons = lessonRange(1, 10);
    const checks = [check(2, 6, 10), check(1, 1, 5)];
    const lessonsSnapshot = lessons.map((l) => l.lesson);
    const checksSnapshot = checks.map((c) => c.n);

    const nodes = buildTimeline(lessons, checks);
    expect(shape(nodes)).toBe("L1 L2 L3 L4 L5 K1 L6 L7 L8 L9 L10 K2");
    expect(shape(buildTimeline([...lessons].reverse(), [...checks].reverse()))).toBe(shape(nodes));

    expect(lessons.map((l) => l.lesson)).toEqual(lessonsSnapshot);
    expect(checks.map((c) => c.n)).toEqual(checksSnapshot);
  });

  it("sorts lessons that arrive out of order (ADR-105 order: number asc, unnumbered last)", () => {
    const lessons = [lesson(3), lesson(1), lesson(2)];
    expect(shape(buildTimeline(lessons, [check(1, 1, 3)]))).toBe("L1 L2 L3 K1");

    const unnumbered: LearnLesson = { ...lesson(0), slug: "unnumbered", lesson: 0 };
    const nodes = buildTimeline([...lessons, unnumbered], [check(1, 1, 3)]);
    expect(shape(nodes)).toBe("L1 L2 L3 K1 L0");
  });
});

describe("buildTimeline — ?sort=desc reversal", () => {
  it("reverses with the nodes: each check sits just before its range end", () => {
    const asc = buildTimeline(lessonRange(1, 10), [check(1, 1, 5), check(2, 6, 10)]);
    const desc = [...asc].reverse();

    expect(desc).toHaveLength(asc.length);
    expect(shape(desc)).toBe("K2 L10 L9 L8 L7 L6 K1 L5 L4 L3 L2 L1");
    // The check did not jump: it is still attached to lesson 5 / lesson 10.
    expect(indexOfNode(desc, "K1")).toBe(indexOfNode(desc, "L5") - 1);
    expect(indexOfNode(desc, "K2")).toBe(indexOfNode(desc, "L10") - 1);
  });

  it("keeps trailing checks (unpublished range) attached to the tail on reversal", () => {
    const asc = buildTimeline(lessonRange(1, 7), [check(2, 21, 25)]);
    const desc = [...asc].reverse();
    expect(shape(desc)).toBe("K2 L7 L6 L5 L4 L3 L2 L1");
  });
});

/* ------------------------------------------------------------------ */
/*  Real content — non-5 cadences                                      */
/* ------------------------------------------------------------------ */

describe("buildTimeline — real series cadences", () => {
  it("places all 12 sf-omni-consultant checks at their resolved range ends", () => {
    const checks = getKnowledgeChecks("sf-omni-consultant");
    const total = seriesLessonCount("sf-omni-consultant");
    expect(checks).toHaveLength(12);
    expect(total).toBe(62);

    const nodes = buildTimeline(lessonRange(1, total), checks);
    expect(nodes).toHaveLength(total + checks.length);

    for (const c of checks) {
      const index = nodes.findIndex((node) => node.kind === "check" && node.check.n === c.n);
      const before = nodes[index - 1];
      expect(index).toBeGreaterThan(0);
      expect(before?.kind).toBe("lesson");
      // Sits after the last published lesson of its range (the range end here).
      expect(before?.kind === "lesson" && before.lesson.lesson).toBe(Math.min(c.lessons[1], total));
    }

    // Last check ends at lesson 62 → the timeline ends on the check node.
    expect(nodes[nodes.length - 1]).toEqual({ kind: "check", check: checks[11] });
  });

  it("places all 6 ai-at-work checks at their resolved range ends", () => {
    const checks = getKnowledgeChecks("ai-at-work");
    const total = seriesLessonCount("ai-at-work");
    expect(checks).toHaveLength(6);
    expect(checks.map((c) => c.lessons)).toEqual([
      [1, 5],
      [6, 10],
      [11, 15],
      [16, 20],
      [21, 25],
      [26, 30],
    ]);

    const nodes = buildTimeline(lessonRange(1, total), checks);
    expect(nodes).toHaveLength(36);
    expect(shape(nodes)).toBe(
      "L1 L2 L3 L4 L5 K1 L6 L7 L8 L9 L10 K2 L11 L12 L13 L14 L15 K3 " +
        "L16 L17 L18 L19 L20 K4 L21 L22 L23 L24 L25 K5 L26 L27 L28 L29 L30 K6",
    );
  });

  it("follows agentic-ai's 8-lesson ranges (check 2 after lesson 16, not lesson 10)", () => {
    const checks = getKnowledgeChecks("agentic-ai");
    const total = seriesLessonCount("agentic-ai");
    expect(checks.map((c) => c.lessons)).toEqual([
      [1, 8],
      [9, 16],
      [17, 24],
      [25, 32],
      [33, 40],
      [41, 48],
      [49, 56],
      [57, 64],
      [65, 72],
      [73, 81],
    ]);

    const nodes = buildTimeline(lessonRange(1, total), checks);
    expect(nodes).toHaveLength(total + checks.length);
    const index = nodes.findIndex((node) => node.kind === "check" && node.check.n === 2);
    const before = nodes[index - 1];
    expect(index).toBeGreaterThan(0);
    expect(before?.kind).toBe("lesson");
    // Real lessons carry their full frontmatter, so compare the number, not the object.
    expect(before?.kind === "lesson" ? before.lesson.lesson : undefined).toBe(16);
    const after = nodes[index + 1];
    expect(after?.kind === "lesson" ? after.lesson.lesson : undefined).toBe(17);
  });
});

/* ------------------------------------------------------------------ */
/*  checkEndingAt / checkCovering                                       */
/* ------------------------------------------------------------------ */

describe("checkEndingAt", () => {
  const checks = [check(1, 1, 5), check(2, 6, 10), check(3, 5, 5)];

  it("finds the check whose range ends at the lesson", () => {
    expect(checkEndingAt(checks, 10)).toEqual(check(2, 6, 10));
    expect(checkEndingAt(checks, 6)).toBeUndefined();
    // Lessons 5 ends two ranges (checks 1 and 3) — the lowest n is the milestone.
    expect(checkEndingAt(checks, 5)).toEqual(check(1, 1, 5));
  });

  it("returns undefined before the first / after the last range end", () => {
    expect(checkEndingAt(checks, 1)).toBeUndefined();
    expect(checkEndingAt(checks, 99)).toBeUndefined();
  });

  it("picks the lowest n when several checks share an end lesson", () => {
    expect(checkEndingAt([check(2, 5, 8), check(1, 1, 8)], 8)).toEqual(check(1, 1, 8));
  });

  it("resolves real data: lesson 5 → check 1, lesson 62 → check 12 (sf-omni-consultant)", () => {
    const real = getKnowledgeChecks("sf-omni-consultant");
    expect(checkEndingAt(real, 5)?.n).toBe(1);
    expect(checkEndingAt(real, 6)).toBeUndefined();
    expect(checkEndingAt(real, 62)?.n).toBe(12);
  });
});

describe("checkCovering", () => {
  const checks = [check(1, 1, 5), check(2, 6, 10), check(9, 4, 8)];

  it("finds the check whose range covers the lesson", () => {
    expect(checkCovering(checks, 1)).toEqual(check(1, 1, 5));
    expect(checkCovering(checks, 5)).toEqual(check(1, 1, 5));
    expect(checkCovering(checks, 10)).toEqual(check(2, 6, 10));
  });

  it("returns undefined outside every range", () => {
    expect(checkCovering(checks, 0)).toBeUndefined();
    expect(checkCovering(checks, 11)).toBeUndefined();
  });

  it("picks the lowest n when ranges overlap", () => {
    expect(checkCovering(checks, 5)).toEqual(check(1, 1, 5));
    expect(checkCovering([check(9, 4, 8), check(1, 1, 5)], 5)).toEqual(check(1, 1, 5));
  });
});

/* ------------------------------------------------------------------ */
/*  nextLessonAfter                                                     */
/* ------------------------------------------------------------------ */

describe("nextLessonAfter", () => {
  const lessons = lessonRange(1, 10);

  it("returns the lesson immediately after the range end", () => {
    expect(nextLessonAfter(lessons, 5)).toEqual(lesson(6));
    expect(nextLessonAfter(lessons, 1)).toEqual(lesson(2));
  });

  it("returns undefined after the last lesson", () => {
    expect(nextLessonAfter(lessons, 10)).toBeUndefined();
    expect(nextLessonAfter(lessons, 11)).toBeUndefined();
  });

  it("returns the first lesson when asked for lesson 0 or below", () => {
    expect(nextLessonAfter(lessons, 0)).toEqual(lesson(1));
    expect(nextLessonAfter(lessons, -3)).toEqual(lesson(1));
  });

  it("skips gaps and unnumbered lessons", () => {
    const gapped = [...lessonRange(1, 5), lesson(8), { ...lesson(0), lesson: 0, slug: "x" }];
    expect(nextLessonAfter(gapped, 5)).toEqual(lesson(8));
    expect(nextLessonAfter(gapped, 8)).toBeUndefined();
  });

  it("returns undefined for a series with no lessons", () => {
    expect(nextLessonAfter([], 5)).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  checkState — passed | available only                                */
/* ------------------------------------------------------------------ */

describe("checkState", () => {
  it("returns 'passed' when the set contains the check number", () => {
    expect(checkState(check(2, 6, 10), new Set([1, 2]))).toBe("passed");
  });

  it("returns 'available' otherwise, including for empty sets and other checks' numbers", () => {
    expect(checkState(check(2, 6, 10), new Set())).toBe("available");
    expect(checkState(check(2, 6, 10), new Set([1, 3]))).toBe("available");
  });

  it("only ever returns 'passed' or 'available' — there is no locked state (ADR-304)", () => {
    const checks = [check(1, 1, 5), check(2, 6, 10), check(12, 56, 62)];
    const sets = [new Set<number>(), new Set([1]), new Set([2]), new Set([1, 2, 12])];
    for (const c of checks) {
      for (const passed of sets) {
        expect(["passed", "available"]).toContain(checkState(c, passed));
      }
    }
  });

  it("takes no mode parameter — an extra argument cannot make it 'locked'", () => {
    const checkStateArity = checkState.length;
    expect(checkStateArity).toBe(2);
    const forced = (checkState as unknown as (...args: unknown[]) => string)(
      check(1, 1, 5),
      new Set(),
      "gate",
      "locked",
    );
    expect(forced).toBe("available");
  });
});

/* ------------------------------------------------------------------ */
/*  hiddenByFilter — D-5 rule                                           */
/* ------------------------------------------------------------------ */

describe("hiddenByFilter", () => {
  const lessonNode: TimelineNode = { kind: "lesson", lesson: lesson(3) };
  const checkNode: TimelineNode = { kind: "check", check: check(1, 1, 5) };

  it("hides a lesson node whose number is hidden", () => {
    expect(hiddenByFilter(lessonNode, new Set([3]), new Set())).toBe(true);
    expect(hiddenByFilter(lessonNode, new Set([1, 2]), new Set())).toBe(false);
  });

  it("hides a passed check only when every lesson in its range is hidden", () => {
    const all = new Set([1, 2, 3, 4, 5]);
    expect(hiddenByFilter(checkNode, all, new Set([1]))).toBe(true);
  });

  it("keeps a passed check visible while any lesson of its range is still shown", () => {
    expect(hiddenByFilter(checkNode, new Set([1, 2, 3, 4]), new Set([1]))).toBe(false);
    expect(hiddenByFilter(checkNode, new Set(), new Set([1]))).toBe(false);
  });

  it("never hides an unpassed check, even when its whole range is hidden", () => {
    const all = new Set([1, 2, 3, 4, 5]);
    expect(hiddenByFilter(checkNode, all, new Set())).toBe(false);
    expect(hiddenByFilter(checkNode, all, new Set([2]))).toBe(false);
  });

  it("does not hide an unnumbered lesson node", () => {
    const unnumbered: TimelineNode = { kind: "lesson", lesson: { ...lesson(0), lesson: 0 } };
    expect(hiddenByFilter(unnumbered, new Set([0, 1]), new Set())).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Fail loudly — no resolved range, no 5n recompute                     */
/* ------------------------------------------------------------------ */

describe("unresolved check ranges fail loudly (never 5n)", () => {
  const lessons = lessonRange(1, 10);
  const broken = [
    { label: "missing lessons", value: { n: 1 } },
    { label: "empty tuple", value: { n: 1, lessons: [] } },
    { label: "single-element tuple", value: { n: 1, lessons: [1] } },
    { label: "non-integer end", value: { n: 1, lessons: [1, 5.5] } },
    { label: "string end", value: { n: 1, lessons: [1, "5"] } },
    { label: "backwards range", value: { n: 1, lessons: [9, 5] } },
    { label: "zero start", value: { n: 1, lessons: [0, 5] } },
    { label: "invalid check number", value: { n: 0, lessons: [1, 5] } },
    { label: "undefined check", value: undefined },
  ] as const;

  for (const { label, value } of broken) {
    it(`buildTimeline throws on ${label}`, () => {
      expect(() => buildTimeline(lessons, [value as unknown as KnowledgeCheckMeta])).toThrow(
        /unresolved check range/,
      );
    });

    it(`the query helpers throw on ${label}`, () => {
      const checks = [value as unknown as KnowledgeCheckMeta];
      expect(() => checkEndingAt(checks, 5)).toThrow(/unresolved check range/);
      expect(() => checkCovering(checks, 5)).toThrow(/unresolved check range/);
      expect(() => checkState(checks[0]!, new Set())).toThrow(/unresolved check range/);
      expect(() =>
        hiddenByFilter({ kind: "check", check: checks[0]! }, new Set(), new Set()),
      ).toThrow(/unresolved check range/);
    });
  }

  it("the error names the contract and forbids recomputing 5n", () => {
    expect(() => buildTimeline(lessons, [{ n: 1 } as unknown as KnowledgeCheckMeta])).toThrow(
      /getKnowledgeChecks/,
    );
    expect(() => buildTimeline(lessons, [{ n: 1 } as unknown as KnowledgeCheckMeta])).toThrow(/5n/);
    expect(() => buildTimeline(lessons, [{ n: 1 } as unknown as KnowledgeCheckMeta])).toThrow(
      /ADR-303/,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Input conformance — the 90 check files (architecture.md §9)          */
/* ------------------------------------------------------------------ */

describe("input conformance — every check file carries a Lessons A–B range", () => {
  const RANGE_RE = /Lessons\s+(\d+)\s*[–-]\s*(\d+)/;

  interface CheckFile {
    series: string;
    file: string;
    title: string;
    range: [number, number] | null;
  }

  const files: CheckFile[] = CHECK_SERIES.flatMap((series) => {
    const dir = path.join(LEARN_ROOT, series, "checks");
    return fs
      .readdirSync(dir)
      .filter((file) => /^check-\d+\.json$/.test(file))
      .map((file) => {
        const json = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as {
          title?: string;
        };
        const title = json.title ?? "";
        const match = RANGE_RE.exec(title);
        return {
          series,
          file,
          title,
          range: match ? ([Number(match[1]), Number(match[2])] as [number, number]) : null,
        };
      });
  });

  it("finds exactly the 90 check files across the 12 series", () => {
    expect(files).toHaveLength(90);
    expect(new Set(files.map((f) => f.series)).size).toBe(12);
  });

  it("every title matches `Lessons A–B`, so quiz.ts's 5n fallback stays dormant", () => {
    const unmatched = files.filter((f) => f.range === null);
    expect(unmatched.map((f) => `${f.series}/${f.file}: ${f.title}`)).toEqual([]);
  });

  it("getKnowledgeChecks resolves each file's title range (fallback never engaged)", () => {
    for (const series of CHECK_SERIES) {
      const resolved = getKnowledgeChecks(series);
      const expected = files
        .filter((f) => f.series === series)
        .sort((a, b) => Number(/\d+/.exec(a.file)![0]) - Number(/\d+/.exec(b.file)![0]))
        .map((f, index) => ({ n: index + 1, lessons: f.range }));
      expect(resolved.map((c) => ({ n: c.n, lessons: c.lessons }))).toEqual(expected);
    }
  });

  it("resolved ranges follow the titles, not `5n` (8-lesson and short-tail series prove it)", () => {
    // `agentic-ai` publishes 8-lesson ranges: a live `5n` fallback would report
    // [1,5], [6,10], … instead of the titles' [1,8], [9,16], …
    expect(getKnowledgeChecks("agentic-ai").slice(0, 3)).toEqual([
      { n: 1, lessons: [1, 8] },
      { n: 2, lessons: [9, 16] },
      { n: 3, lessons: [17, 24] },
    ]);
    // Short tail: the last range simply ends at the last lesson.
    const aiAdoption = getKnowledgeChecks("ai-adoption");
    expect(aiAdoption[aiAdoption.length - 1]).toEqual({ n: 7, lessons: [31, 35] });
    // And every resolved range equals the range parsed from its own file title.
    const byTitle = new Map(files.map((f) => [`${f.series}:${f.file}`, f.range]));
    for (const series of CHECK_SERIES) {
      for (const c of getKnowledgeChecks(series)) {
        expect(byTitle.get(`${series}:check-${c.n}.json`)).toEqual(c.lessons);
      }
    }
  });

  it("AI at Work and OmniStudio cadences are covered by the suite's fixtures", () => {
    expect(getKnowledgeChecks("ai-at-work")).toHaveLength(6);
    expect(getKnowledgeChecks("sf-omni-consultant")).toHaveLength(12);
  });
});

/* ------------------------------------------------------------------ */
/*  Module surface — no gate, no fs, no 5n arithmetic                   */
/* ------------------------------------------------------------------ */

describe("module surface", () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, "src", "lib", "lesson-checks.ts"), "utf8");
  /**
   * The surface rules are about CODE, not prose: the file is allowed — required,
   * even — to say `5n` and `"locked"` in the doc comment and in the thrown error
   * that forbid them ("Do not recompute 5n here", ADR-303). Strip comments so
   * the assertions below only see executable surface.
   */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("contains no 5n arithmetic", () => {
    // Arithmetic only. The bare token `5n` is prose (the error text that forbids
    // it), so it is not evidence of a recompute.
    expect(code).not.toMatch(/5\s*\*\s*n/);
    expect(code).not.toMatch(/n\s*\*\s*5/);
    expect(code).not.toMatch(/5\s*\*\s*\(\s*n\s*[-+]/);
    expect(code).not.toMatch(/5n\s*[-+*/]|[-+*/]\s*5n/);
  });

  it("has no locked state and no gate/mode surface (ADR-304)", () => {
    expect(code).not.toMatch(/locked/i);
    expect(code).not.toMatch(/LessonGateMode|resolveLessonGate|LESSON_GATE_MODE|learn-gate/);
    expect(code).not.toMatch(/\bmode\b/);
  });

  it("is importable client and server: no fs, no path, no React", () => {
    expect(source).not.toMatch(/from\s+["'](node:)?fs["']/);
    expect(source).not.toMatch(/from\s+["'](node:)?path["']/);
    expect(source).not.toMatch(/from\s+["']react["']/);
    expect(source).not.toMatch(/["']server-only["']/);
  });
});
