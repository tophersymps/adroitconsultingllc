/**
 * No-hardcoded-exam-label guard (B6, Workstream B integration).
 *
 * `src/lib/exam-labels.ts` is the ONLY place the app may spell the exam's name.
 * Workstream B plumbed `kind` through every surface; this test is what stops
 * the next edit from quietly typing the words back into a component and
 * re-introducing the US-009 bug ("a Tracks course labelled Certification Prep").
 *
 * Sweep scope (the surfaces a learner can see the exam named on):
 *   - src/components/Progress/**   (ExamCard, ExamLocked, ExamWidget, GuestCTA,
 *                                   Certificate, CheckCardList)
 *   - src/app/atlas/**             (series / exam / certificate / check pages)
 *   - src/lib/sky.ts, sky-server.ts (chronicle labels)
 *
 * Allow-list (and why):
 *   - src/lib/exam-labels.ts — the label source itself.
 *   - any *.test.ts(x) / *.spec.ts(x) — assertions must name the strings to
 *     prove their absence; tests are not shipped copy.
 *   - src/data/types.ts — the `ExamKind` union (bare type names, no copy).
 *   - design/** and deliverables/** — design/copy references, not app code and
 *     not in the sweep scope; listed so the intent is explicit.
 *
 * Comments are stripped before matching: a doc comment may legitimately quote
 * the old wording while explaining the fix ("NEVER 'cert prep exam'"), and a
 * guard that greps raw bytes would punish exactly the documentation that keeps
 * the rule alive. Rendered copy is what matters, so the check runs on code text.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { EXAM_LABELS } from "@/lib/exam-labels";

const ROOT = process.cwd();

/** Files/dirs allowed to spell the labels out (see the doc block above). */
const ALLOWED = [
  "src/lib/exam-labels.ts",
  "src/data/types.ts",
];

const SWEEP_ROOTS = [
  "src/components/Progress",
  "src/app/atlas",
];

const SWEEP_FILES = ["src/lib/sky.ts", "src/lib/sky-server.ts"];

const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;

/** Every spelling of the exam name the app may render (both kinds). */
const FORBIDDEN_LABELS: string[] = Array.from(
  new Set(
    Object.values(EXAM_LABELS).flatMap((labels) => [labels.full, labels.short, labels.phrase]),
  ),
);

/** Recursively collect `.ts`/`.tsx` sources under a directory. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(rel, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Remove block and line comments so only code/JSX text remains. A `//` that is
 * part of a URL (`https://`) is left alone.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const SWEPT_FILES = [
  ...SWEEP_ROOTS.flatMap((dir) => walk(dir)),
  ...SWEEP_FILES,
].filter((rel) => !TEST_FILE.test(rel) && !ALLOWED.includes(rel));

describe("no hardcoded exam label outside src/lib/exam-labels.ts", () => {
  it("sweeps a real set of files (the guard is not vacuous)", () => {
    // If a refactor moves a directory, this fails loudly instead of silently
    // sweeping nothing and passing.
    expect(SWEPT_FILES.length).toBeGreaterThan(15);
    expect(SWEPT_FILES).toEqual(
      expect.arrayContaining([
        "src/components/Progress/ExamCard.tsx",
        "src/components/Progress/ExamLocked.tsx",
        "src/components/Progress/ExamWidget.tsx",
        "src/components/Progress/GuestCTA.tsx",
        "src/components/Progress/Certificate.tsx",
        "src/components/Progress/CheckCardList.tsx",
        "src/app/atlas/[series]/page.tsx",
        "src/app/atlas/[series]/exam/page.tsx",
        "src/lib/sky.ts",
      ]),
    );
  });

  it("derives the forbidden strings from the label source (so copy edits stay covered)", () => {
    expect(FORBIDDEN_LABELS).toContain("Certification Prep Exam");
    expect(FORBIDDEN_LABELS).toContain("Cert Prep Exam");
    expect(FORBIDDEN_LABELS).toContain("cert prep exam");
    expect(FORBIDDEN_LABELS).toContain("Course Completion Exam");
    expect(FORBIDDEN_LABELS).toContain("Course Exam");
    expect(FORBIDDEN_LABELS).toContain("course completion exam");
  });

  it("finds zero exam-label literals in the swept surfaces", () => {
    const violations: string[] = [];
    for (const rel of SWEPT_FILES) {
      const code = stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8")).toLowerCase();
      for (const label of FORBIDDEN_LABELS) {
        if (code.includes(label.toLowerCase())) violations.push(`${rel}: ${JSON.stringify(label)}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps the label source allow-listed and out of the sweep", () => {
    expect(SWEPT_FILES).not.toContain("src/lib/exam-labels.ts");
    expect(ALLOWED).toContain("src/lib/exam-labels.ts");
  });
});
