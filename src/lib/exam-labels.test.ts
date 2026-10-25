import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ExamKind } from "@/data/types";
import { EXAM_LABELS, examLabels } from "@/lib/exam-labels";

/**
 * B2 — the label source (deliverables/learn-ux-exam-naming/ §B2).
 *
 * `src/lib/exam-labels.ts` is the only place exam wording may live. These tests
 * pin three things that B3–B5 depend on:
 *
 *  1. every one of the 12 series maps, through its own `examKind`, to the copy
 *     in `api-contracts.md` §C — the whole course-completion set, not just
 *     AI at Work (waves.md §3.0 / US-009, US-010, US-011);
 *  2. counts and pass marks are props, never literals baked into the label;
 *  3. an unknown kind throws instead of falling back to certification prep.
 */

const REPO_ROOT = process.cwd();
const LEARN_DIR = path.join(REPO_ROOT, "content", "learn");

/**
 * waves.md §3.0 classification, hardcoded on purpose: this test asserts the
 * SEEDED kind per series as well as the label the kind produces, so a silently
 * flipped `series.json` cannot take the test green with it.
 */
const EXPECTED_KIND: Record<string, ExamKind> = {
  // course-completion — our own courses (8)
  "ai-at-work": "course-completion",
  "ai-adoption": "course-completion",
  "ai-power-user": "course-completion",
  "hermes-consultant": "course-completion",
  "hermes-consultant-intermediate": "course-completion",
  "hermes-consultant-advanced": "course-completion",
  "agentic-ai": "course-completion",
  "salesforce-architect": "course-completion",
  // certification-prep — vendor certification practice exams (4)
  "omni-studio-cert": "certification-prep",
  "salesforce-data-architect": "certification-prep",
  "salesforce-sharing-visibility-architect": "certification-prep",
  "sf-omni-consultant": "certification-prep",
};

/** api-contracts.md §C copy table, verbatim. */
const EXPECTED_COPY: Record<ExamKind, { full: string; short: string; phrase: string }> = {
  "certification-prep": {
    full: "Certification Prep Exam",
    short: "Cert Prep Exam",
    phrase: "cert prep exam",
  },
  "course-completion": {
    full: "Course Completion Exam",
    short: "Course Exam",
    phrase: "course completion exam",
  },
};

function readSeriesJson(slug: string): { name: string; examKind: ExamKind } {
  const file = path.join(LEARN_DIR, slug, "series.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as { name: string; examKind: ExamKind };
}

describe("exam-labels / 12-series matrix (waves.md §3.0)", () => {
  it("covers every series in content/learn — no series is untested", () => {
    const onDisk = fs
      .readdirSync(LEARN_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(onDisk).toEqual(Object.keys(EXPECTED_KIND).sort());
    expect(onDisk).toHaveLength(12);
  });

  it.each(Object.keys(EXPECTED_KIND).sort())("%s → expected full/short/phrase", (slug) => {
    const series = readSeriesJson(slug);
    const expectedKind = EXPECTED_KIND[slug];

    // B1 seeded the kind; the test goes red if a series flips without the copy
    // table being revisited.
    expect(series.examKind, `${slug} examKind`).toBe(expectedKind);

    const labels = examLabels(series.examKind);
    const expected = EXPECTED_COPY[expectedKind];
    expect(labels.full).toBe(expected.full);
    expect(labels.short).toBe(expected.short);
    expect(labels.phrase).toBe(expected.phrase);
  });

  it("a course-completion series never yields certification wording", () => {
    for (const [slug, kind] of Object.entries(EXPECTED_KIND)) {
      if (kind !== "course-completion") continue;
      const labels = examLabels(kind);
      const surface = [
        labels.full,
        labels.short,
        labels.phrase,
        labels.lockHeading(9),
        labels.seoTitle(slug),
        labels.seoDescription(slug),
        labels.unlockNote(80),
      ].join(" ");
      expect(surface, `${slug} leaks certification wording`).not.toMatch(/cert(ification)?\s*prep/i);
    }
  });

  it("a certification series keeps certification wording and no course-completion wording", () => {
    for (const [slug, kind] of Object.entries(EXPECTED_KIND)) {
      if (kind !== "certification-prep") continue;
      const labels = examLabels(kind);
      expect(labels.full).toContain("Certification Prep");
      const surface = [
        labels.full,
        labels.short,
        labels.phrase,
        labels.lockHeading(9),
        labels.seoTitle(slug),
        labels.seoDescription(slug),
        labels.unlockNote(80),
      ].join(" ");
      expect(surface, `${slug} leaks course-completion wording`).not.toMatch(/course\s*completion/i);
    }
  });
});

describe("exam-labels / counts and pass marks come from props", () => {
  it("lockHeading(4) uses 4, not the 9 hardcoded on today's locked panel", () => {
    for (const kind of Object.keys(EXAM_LABELS) as ExamKind[]) {
      const heading = examLabels(kind).lockHeading(4);
      expect(heading).toBe("Unlock: complete all 4 knowledge checks with 80%+");
      expect(heading).not.toContain("9");
    }
  });

  it("lockHeading follows the count it is given", () => {
    expect(examLabels("course-completion").lockHeading(1)).toContain("all 1 knowledge checks");
    expect(examLabels("certification-prep").lockHeading(6)).toContain("all 6 knowledge checks");
  });

  it("unlockNote follows the pass mark it is given", () => {
    expect(examLabels("course-completion").unlockNote(80)).toBe(
      "The timed course completion exam opens once every knowledge check is passed at 80% or higher.",
    );
    expect(examLabels("certification-prep").unlockNote(75)).toContain("passed at 75% or higher");
  });

  it("seoTitle / seoDescription interpolate the series name and stay kind-aware", () => {
    expect(examLabels("course-completion").seoTitle("AI at Work")).toBe(
      "AI at Work: Course Completion Exam | Adroit Learn",
    );
    expect(examLabels("certification-prep").seoTitle("OmniStudio Developer Certification")).toBe(
      "OmniStudio Developer Certification: Certification Prep Exam | Adroit Learn",
    );
    expect(examLabels("course-completion").seoDescription("AI at Work")).toBe(
      "Timed course completion exam for AI at Work.",
    );
    expect(examLabels("certification-prep").seoDescription("OmniStudio Developer Certification")).toBe(
      "Timed certification prep exam for OmniStudio Developer Certification.",
    );
  });
});

describe("exam-labels / totality", () => {
  it("an unknown kind throws instead of defaulting to cert prep", () => {
    expect(() => examLabels("bogus" as ExamKind)).toThrow(/unknown ExamKind/);
    expect(() => examLabels(undefined as unknown as ExamKind)).toThrow(/unknown ExamKind/);
    expect(() => examLabels("" as ExamKind)).toThrow(/unknown ExamKind/);
  });

  it("does not answer inherited object keys with a labelling", () => {
    expect(() => examLabels("constructor" as ExamKind)).toThrow(/unknown ExamKind/);
    expect(() => examLabels("toString" as ExamKind)).toThrow(/unknown ExamKind/);
  });

  it("defines exactly one labelling per ExamKind — no gaps, no extras", () => {
    expect(Object.keys(EXAM_LABELS).sort()).toEqual(["certification-prep", "course-completion"]);
  });
});

describe("exam-labels / client safety", () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, "src", "lib", "exam-labels.ts"), "utf8");

  it("imports only a type — no learn data, no server-only module", () => {
    const importLines = source.match(/^\s*import[\s\S]*?from\s+["'][^"']+["'];?/gm) ?? [];
    expect(importLines).toHaveLength(1);
    expect(importLines[0]).toContain("import type");
    expect(importLines[0]).toContain('"@/data/types"');
    expect(source).not.toMatch(/@\/data\/learn|server-only|node:fs/);
  });

  it("has no per-series table and no inference from `group`", () => {
    for (const slug of Object.keys(EXPECTED_KIND)) {
      expect(source, `exam-labels.ts must not name the series ${slug}`).not.toContain(slug);
    }
    expect(source).not.toMatch(/group/);
  });
});
