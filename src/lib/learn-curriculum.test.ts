/**
 * learn-curriculum.test.ts — guard the `curriculumLessons` declarations.
 *
 * The constellation system sizes a course's figure from
 * `series.json → curriculumLessons` -- the curriculum's FINAL lesson count --
 * NOT from `totalLessons` (the highest published lesson number today, which
 * grows daily as the learning crons land new lessons).
 *
 * If a series does not declare `curriculumLessons`, `build-learn.js` falls back
 * to `totalLessons`, so the figure reshuffles every time a lesson ships. That
 * is the exact failure this guard exists to stop.
 *
 * These assertions read the real `series.json` files (never the generated
 * `learn.ts`, which is derived from them) so the source of truth is what is
 * checked.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Every learning-track series on the site. */
const SERIES_DIR = path.join(process.cwd(), "content", "learn");

function seriesDirs(): string[] {
  return fs
    .readdirSync(SERIES_DIR)
    .filter((d) => fs.statSync(path.join(SERIES_DIR, d)).isDirectory())
    .sort();
}

function readSeriesJson(dir: string): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(SERIES_DIR, dir, "series.json"), "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Highest `lesson` number among the published lesson MDX files (mirrors build-learn.js). */
function highestPublishedLesson(dir: string): number {
  const files = fs
    .readdirSync(path.join(SERIES_DIR, dir))
    .filter((f) => f.endsWith(".mdx") && !f.startsWith("."));
  let max = 0;
  for (const f of files) {
    const raw = fs.readFileSync(path.join(SERIES_DIR, dir, f), "utf-8");
    const m = raw.match(/^lesson:\s*(\d+)/m);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

/**
 * The curriculum's final lesson count, from the scheduler source of truth
 * (jimmy-learning-scheduler.py + omni-studio-curriculum.py).
 *
 * This is DOCUMENTATION, not the source of truth -- the source is the
 * scheduler at ~/.hermes/scripts/. If a course's curriculum grows, this map
 * must be updated in lockstep with BOTH the scheduler AND series.json; the
 * `>= totalLessons` assertion below catches any declaration that falls behind
 * what is already published, and this map catches an accidental edit to a
 * wrong literal.
 */
const SCHEDULER_FINAL_COUNTS: Record<string, number> = {
  "agentic-ai": 90,
  "ai-at-work": 30,
  "hermes-consultant": 30,
  "hermes-consultant-advanced": 20,
  "hermes-consultant-intermediate": 25,
  "omni-studio-cert": 46,
  "salesforce-architect": 90,
};

describe("series.json curriculumLessons declarations", () => {
  const dirs = seriesDirs();
  expect(dirs.length, "expected the seven learning tracks").toBe(7);

  for (const dir of dirs) {
    const cfg = readSeriesJson(dir);

    it(`${dir}: declares curriculumLessons`, () => {
      expect(
        cfg.curriculumLessons,
        `${dir} must declare "curriculumLessons" (final planned lesson count) in series.json; ` +
          `otherwise build-learn.js falls back to the published-so-far count and the ` +
          `constellation reshuffles daily.`,
      ).toBeTypeOf("number");
      expect(cfg.curriculumLessons as number).toBeGreaterThan(0);
    });

    it(`${dir}: curriculumLessons >= published (no shrink/reshuffle)`, () => {
      const declared = cfg.curriculumLessons as number;
      const published = highestPublishedLesson(dir);
      expect(
        declared,
        `${dir} declares curriculumLessons=${declared} but ${published} lessons are ` +
          `already published. A declaration below the published count would break the ` +
          `constellation and certificate gating. Update series.json (and the scheduler ` +
          `if the curriculum truly grew).`,
      ).toBeGreaterThanOrEqual(published);
    });

    it(`${dir}: matches the scheduler's final count`, () => {
      const expected = SCHEDULER_FINAL_COUNTS[dir];
      expect(
        expected,
        `${dir} has no documented scheduler final count -- add one to SCHEDULER_FINAL_COUNTS.`,
      ).toBeTypeOf("number");
      expect(cfg.curriculumLessons).toBe(expected);
    });
  }
});