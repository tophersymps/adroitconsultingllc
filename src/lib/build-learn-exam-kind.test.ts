import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { learnSeries } from "@/data/learn";

/**
 * B1 — examKind plumbing (deliverables/learn-ux-exam-naming/ §B1).
 *
 * `series.json` must declare the exam kind, and `scripts/build-learn.js` must
 * fail the build when it is missing or invalid. Without that gate a new series
 * could ship with no classification and every exam surface would have to guess.
 */

const require = createRequire(import.meta.url);
/**
 * vitest runs from the repo root (`vitest.config.ts` lives there). Resolve the
 * generator from cwd rather than import.meta.url: under the vite transform
 * import.meta.url is not a file: URL, so fileURLToPath() throws.
 */
const REPO_ROOT = process.cwd();
const SCRIPT_PATH = path.join(REPO_ROOT, "scripts", "build-learn.js");
const {
  EXAM_KINDS,
  validateExamKind,
}: {
  EXAM_KINDS: string[];
  validateExamKind: (cfg: unknown, slug: string) => string;
} = require(SCRIPT_PATH);

const SERIES_JSON_KEYS = ["name", "description"];

/** Write a throwaway content tree with one series and run the real generator. */
function runGeneratorWith(seriesJson: Record<string, unknown>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "build-learn-examkind-"));
  const seriesDir = path.join(root, "content", "learn", "fixture-series");
  fs.mkdirSync(seriesDir, { recursive: true });
  fs.writeFileSync(
    path.join(seriesDir, "series.json"),
    JSON.stringify({ name: "Fixture", description: "Fixture series.", ...seriesJson }),
  );
  const out = path.join(root, "learn.ts");
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: root,
    encoding: "utf-8",
    env: { ...process.env, LEARN_DIR: path.join(root, "content", "learn"), LEARN_OUT: out },
  });
  return { ...result, out, root };
}

describe("build-learn examKind validation", () => {
  it("accepts both documented kinds", () => {
    for (const kind of ["course-completion", "certification-prep"]) {
      expect(validateExamKind({ examKind: kind }, "s")).toBe(kind);
    }
    expect(EXAM_KINDS).toEqual(["course-completion", "certification-prep"]);
  });

  it("throws when examKind is missing", () => {
    expect(() => validateExamKind({}, "ai-at-work")).toThrow(/missing "examKind"/i);
  });

  it("throws when examKind is not one of the two values", () => {
    expect(() => validateExamKind({ examKind: "certification" }, "ai-at-work")).toThrow(
      /invalid "examKind"/i,
    );
    expect(() => validateExamKind({ examKind: 42 }, "ai-at-work")).toThrow(
      /invalid "examKind"/i,
    );
  });

  it("fails the real generator (non-zero exit) when a series has no examKind", () => {
    const result = runGeneratorWith({});
    expect(result.status).not.toBe(0);
    expect(`${result.stderr}`).toMatch(/examKind/);
    expect(fs.existsSync(result.out)).toBe(false);
  });

  it("fails the real generator when examKind is invalid", () => {
    const result = runGeneratorWith({ examKind: "cert-prep" });
    expect(result.status).not.toBe(0);
    expect(`${result.stderr}`).toMatch(/invalid "examKind"/);
  });

  it("generates the module when examKind is valid", () => {
    const result = runGeneratorWith({ examKind: "certification-prep" });
    expect(result.status).toBe(0);
    const generated = fs.readFileSync(result.out, "utf-8");
    expect(generated).toContain('"examKind": "certification-prep"');
  });

  it("ships examKind on all 12 series, matching the waves.md §3.0 classification", () => {
    expect(learnSeries).toHaveLength(12);
    for (const s of learnSeries) {
      expect(EXAM_KINDS).toContain(s.examKind);
    }
    const certPrep = learnSeries
      .filter((s) => s.examKind === "certification-prep")
      .map((s) => s.slug)
      .sort();
    expect(certPrep).toEqual([
      "omni-studio-cert",
      "salesforce-data-architect",
      "salesforce-sharing-visibility-architect",
      "sf-omni-consultant",
    ]);
    const courseCompletion = learnSeries
      .filter((s) => s.examKind === "course-completion")
      .map((s) => s.slug)
      .sort();
    expect(courseCompletion).toEqual([
      "agentic-ai",
      "ai-adoption",
      "ai-at-work",
      "ai-power-user",
      "hermes-consultant",
      "hermes-consultant-advanced",
      "hermes-consultant-intermediate",
      "salesforce-architect",
    ]);
  });

  it("keeps the raw series.json files honest (every one declares a valid kind)", () => {
    const learnDir = path.join(REPO_ROOT, "content", "learn");
    const dirs = fs
      .readdirSync(learnDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(dirs).toHaveLength(12);
    for (const slug of dirs) {
      const cfg = JSON.parse(
        fs.readFileSync(path.join(learnDir, slug, "series.json"), "utf-8"),
      );
      for (const key of SERIES_JSON_KEYS) expect(cfg[key], `${slug}.${key}`).toBeTruthy();
      expect(EXAM_KINDS, slug).toContain(cfg.examKind);
    }
  });
});
