import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ExamKind } from "@/data/types";
import { examLabels } from "@/lib/exam-labels";

/**
 * B5 — `exam.json` titles match their series' exam kind
 * (deliverables/learn-ux-exam-naming/ §B5, contract in `api-contracts.md` §C).
 *
 * `exam.json.title` is the string the exam page composes into the browser tab
 * (`<title> | Adroit Learn`, `src/app/atlas/[series]/exam/page.tsx`), so a title
 * that still says "Practice Exam" on one of our own courses is learner-visible
 * drift (US-009 / US-010). Two rules, both derived from `examLabels(kind)` — the
 * test never hardcodes label copy, so `src/lib/exam-labels.ts` stays the single
 * source of exam wording:
 *
 *  - `course-completion` → exactly `<series name>: <full>`
 *    (e.g. `AI at Work: Course Completion Exam`);
 *  - `certification-prep` → keeps its certification-naming title, i.e. it still
 *    leads with the series name (which names the certification).
 *
 * Both kinds get the drift assertion from the contract: a title may not contain
 * the *other* kind's label terms. A series whose `examKind` is flipped without
 * its content following (or vice versa) fails here.
 */

const LEARN_DIR = path.join(process.cwd(), "content", "learn");

interface SeriesRow {
  slug: string;
  name: string;
  kind: ExamKind;
  title: string;
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function seriesSlugs(): string[] {
  return fs
    .readdirSync(LEARN_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => fs.existsSync(path.join(LEARN_DIR, slug, "series.json")))
    .sort();
}

/** Every series that ships an exam, with the kind its own content declares. */
function examSeries(): SeriesRow[] {
  return seriesSlugs().map((slug) => {
    const series = readJson(path.join(LEARN_DIR, slug, "series.json")) as {
      name: string;
      examKind: ExamKind;
    };
    const exam = readJson(path.join(LEARN_DIR, slug, "exam.json")) as { title?: string };
    return { slug, name: series.name, kind: series.examKind, title: (exam.title ?? "").trim() };
  });
}

const OTHER: Record<ExamKind, ExamKind> = {
  "course-completion": "certification-prep",
  "certification-prep": "course-completion",
};

/**
 * The label vocabulary a title of the *other* kind would leak: the `full` and
 * `short` strings from `examLabels()`, plus their leading qualifier
 * ("Course Completion", "Certification Prep") so a title that only half-says the
 * label is still caught.
 */
function labelTerms(kind: ExamKind): string[] {
  const { full, short } = examLabels(kind);
  const qualifier = (label: string) => label.replace(/\s+Exam$/, "");
  const terms = [full, short, qualifier(full), qualifier(short)]
    .map((term) => term.toLowerCase().trim())
    .filter((term) => term.includes(" "));
  return Array.from(new Set(terms));
}

/** Contract: a track title must also not claim to be a certification at all. */
const EXTRA_FORBIDDEN: Record<ExamKind, string[]> = {
  "course-completion": ["certification"],
  "certification-prep": [],
};

function forbiddenTerms(kind: ExamKind): string[] {
  return [...labelTerms(OTHER[kind]), ...EXTRA_FORBIDDEN[kind]];
}

const ROWS = examSeries();

describe("exam.json titles — one test per series", () => {
  it("sees all 12 series, split 8 course-completion / 4 certification-prep", () => {
    expect(ROWS.map((row) => row.slug)).toHaveLength(12);
    expect(ROWS.filter((row) => row.kind === "course-completion")).toHaveLength(8);
    expect(ROWS.filter((row) => row.kind === "certification-prep")).toHaveLength(4);
  });

  it.each(ROWS)("$slug has a non-empty title", ({ slug, title }) => {
    expect(title, `${slug}/exam.json: empty title`).not.toBe("");
  });

  it.each(ROWS.filter((row) => row.kind === "course-completion"))(
    "$slug (course-completion) is titled `<series name>: Course Completion Exam`",
    ({ slug, name, title }) => {
      expect(title, `${slug}/exam.json must follow the §C title shape`).toBe(
        `${name}: ${examLabels("course-completion").full}`,
      );
      expect(`${title} | Adroit Learn`).toBe(
        examLabels("course-completion").seoTitle(name),
      );
    },
  );

  it.each(ROWS.filter((row) => row.kind === "certification-prep"))(
    "$slug (certification-prep) keeps its certification-naming title",
    ({ slug, name, title }) => {
      // Contract §C: "keep the certification-naming title (must mention the
      // certification)". B5 leaves these four titles character-for-character
      // unchanged; the test only pins that the certification is still named,
      // allowing a dropped vendor prefix (sf-omni-consultant's series name is
      // "Salesforce OmniStudio Consultant Certification", its title is
      // "OmniStudio Consultant Certification - Practice Exam").
      const certification = name.split(/\s+/).pop() as string;
      expect(title, `${slug}/exam.json must still name its certification`).toContain(
        certification,
      );
      const [fullName, withoutVendor] = [name, name.split(/\s+/).slice(1).join(" ")];
      expect(
        title.includes(fullName) || title.includes(withoutVendor),
        `${slug}/exam.json must lead with the certification name: ${title}`,
      ).toBe(true);
    },
  );

  it.each(ROWS)("$slug title carries no label of the other kind", ({ slug, kind, title }) => {
    const haystack = title.toLowerCase();
    for (const term of forbiddenTerms(kind)) {
      expect(
        haystack.includes(term),
        `${slug} is ${kind} but its title contains the other kind's label "${term}": ${title}`,
      ).toBe(false);
    }
  });
});

describe("exam.json title drift test — proves it bites", () => {
  it("rejects a track title left on the old certification wording", () => {
    const stale = "AI at Work: Certification Prep Exam";
    expect(forbiddenTerms("course-completion").some((term) => stale.toLowerCase().includes(term))).toBe(
      true,
    );
  });

  it("rejects a certification title rewritten with the track wording", () => {
    const mismatched = "OmniStudio Developer Certification: Course Completion Exam";
    expect(forbiddenTerms("certification-prep").some((term) => mismatched.toLowerCase().includes(term))).toBe(
      true,
    );
  });

  it("rejects a course-completion title that is not the contract shape", () => {
    expect("AI at Work: Practice Exam").not.toBe(
      `${"AI at Work"}: ${examLabels("course-completion").full}`,
    );
  });
});
