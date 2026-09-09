/**
 * certificate.ts — certificate-of-completion eligibility tests (ADR-106).
 *
 * Covers: eligibility derivation (46 lessons + exam best >= 72), the 72%
 * boundary, checks-passed counting, completion-date pick, recipient-name
 * resolution, and the series lesson-slug source for the certificate rule.
 */
import { describe, it, expect } from "vitest";
import {
  areAllChecksPassed,
  buildCertificateEligibility,
  certificateCompletionDate,
  certificateCourseName,
  certificateRecipientName,
  formatCertDate,
  getSeriesLessonSlugs,
} from "./certificate";

const CHECK_NAMES = [
  "omni-studio-cert:check:1",
  "omni-studio-cert:check:2",
  "omni-studio-cert:check:3",
  "omni-studio-cert:check:4",
  "omni-studio-cert:check:5",
  "omni-studio-cert:check:6",
  "omni-studio-cert:check:7",
  "omni-studio-cert:check:8",
  "omni-studio-cert:check:9",
];

const lessonSlugs = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `day-${String(i + 1).padStart(2, "0")}-lesson`);

describe("buildCertificateEligibility", () => {
  it("is eligible with all 46 lessons and an exam best >= 72", () => {
    const eligibility = buildCertificateEligibility({
      completedLessonSlugs: lessonSlugs(46),
      totalLessons: 46,
      examRuns: [
        { score: 60, completedAt: "2026-08-01T10:00:00Z" },
        { score: 78, completedAt: "2026-08-02T10:00:00Z" },
      ],
      checkRuns: CHECK_NAMES.map((quizName, i) => ({
        quizName,
        score: 80 + i,
      })),
      checkQuizNames: CHECK_NAMES,
    });
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.lessonsCompleted).toBe(46);
    expect(eligibility.examBest).toBe(78);
    expect(eligibility.examPassed).toBe(true);
    expect(eligibility.checksPassed).toBe(9);
  });

  it("is NOT eligible when lessons are incomplete", () => {
    const eligibility = buildCertificateEligibility({
      completedLessonSlugs: lessonSlugs(45),
      totalLessons: 46,
      examRuns: [{ score: 90, completedAt: "2026-08-02T10:00:00Z" }],
      checkRuns: [],
      checkQuizNames: CHECK_NAMES,
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.lessonsCompleted).toBe(45);
  });

  it("is NOT eligible when the exam best is below 72", () => {
    const eligibility = buildCertificateEligibility({
      completedLessonSlugs: lessonSlugs(46),
      totalLessons: 46,
      examRuns: [{ score: 71, completedAt: "2026-08-02T10:00:00Z" }],
      checkRuns: [],
      checkQuizNames: CHECK_NAMES,
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.examPassed).toBe(false);
  });

  it("passes at exactly 72 (boundary — 72 flat counts)", () => {
    const eligibility = buildCertificateEligibility({
      completedLessonSlugs: lessonSlugs(46),
      totalLessons: 46,
      examRuns: [{ score: 72, completedAt: "2026-08-02T10:00:00Z" }],
      checkRuns: CHECK_NAMES.map((quizName) => ({ quizName, score: 80 })),
      checkQuizNames: CHECK_NAMES,
    });
    expect(eligibility.examPassed).toBe(true);
    expect(eligibility.eligible).toBe(true);
  });

  it("is NOT eligible when checks are incomplete even with all lessons + a passing exam", () => {
    // Defense-in-depth (OWASP A01 / CWE-285): the certificate rule no longer
    // trusts "exam unlocked implies checks passed" — checks are required
    // explicitly, so a bypassed exam submission can't yield a certificate.
    const eligibility = buildCertificateEligibility({
      completedLessonSlugs: lessonSlugs(46),
      totalLessons: 46,
      examRuns: [{ score: 90, completedAt: "2026-08-02T10:00:00Z" }],
      checkRuns: [
        { quizName: "omni-studio-cert:check:1", score: 95 },
        { quizName: "omni-studio-cert:check:2", score: 79 }, // below 80
      ],
      checkQuizNames: CHECK_NAMES,
    });
    expect(eligibility.examPassed).toBe(true);
    expect(eligibility.checksPassed).toBe(1);
    expect(eligibility.checksTotal).toBe(9);
    expect(eligibility.eligible).toBe(false);
  });

  it("counts only checks with best >= 80 and never exceeds the check total", () => {
    const eligibility = buildCertificateEligibility({
      completedLessonSlugs: lessonSlugs(46),
      totalLessons: 46,
      examRuns: [{ score: 80, completedAt: "2026-08-02T10:00:00Z" }],
      checkRuns: [
        { quizName: "omni-studio-cert:check:1", score: 85 },
        { quizName: "omni-studio-cert:check:2", score: 79 }, // below 80
        { quizName: "omni-studio-cert:check:1", score: 90 }, // retake → best 90
        { quizName: "agentic-ai:check:1", score: 100 }, // cross-series — ignored
      ],
      checkQuizNames: CHECK_NAMES,
    });
    expect(eligibility.checksPassed).toBe(1);
    expect(eligibility.checksTotal).toBe(9);
  });

  it("treats no exam runs as best 0 / not passed", () => {
    const eligibility = buildCertificateEligibility({
      completedLessonSlugs: lessonSlugs(46),
      totalLessons: 46,
      examRuns: [],
      checkRuns: [],
      checkQuizNames: CHECK_NAMES,
    });
    expect(eligibility.examBest).toBe(0);
    expect(eligibility.examPassed).toBe(false);
    expect(eligibility.eligible).toBe(false);
  });
});

describe("areAllChecksPassed", () => {
  it("is true when every check has a best score >= 80", () => {
    expect(
      areAllChecksPassed(
        CHECK_NAMES,
        CHECK_NAMES.map((quizName, i) => ({ quizName, score: 80 + i })),
      ),
    ).toBe(true);
  });

  it("is false when any check is missing or below 80", () => {
    // check:2 never attempted → best 0 → locked.
    expect(
      areAllChecksPassed(
        ["omni-studio-cert:check:1", "omni-studio-cert:check:2"],
        [{ quizName: "omni-studio-cert:check:1", score: 95 }],
      ),
    ).toBe(false);
    // Retake semantics: best wins — a 79 then a 90 passes.
    expect(
      areAllChecksPassed(["omni-studio-cert:check:1"], [
        { quizName: "omni-studio-cert:check:1", score: 79 },
        { quizName: "omni-studio-cert:check:1", score: 90 },
      ]),
    ).toBe(true);
    // Best 79 never crosses the bar → locked.
    expect(
      areAllChecksPassed(["omni-studio-cert:check:1"], [
        { quizName: "omni-studio-cert:check:1", score: 79 },
      ]),
    ).toBe(false);
  });

  it("is true for an empty check list (no checks → unlocked)", () => {
    expect(areAllChecksPassed([], [])).toBe(true);
    expect(areAllChecksPassed([], [{ quizName: "other:check:1", score: 10 }])).toBe(true);
  });
});

describe("certificateCompletionDate", () => {
  it("returns the earliest passing run's date", () => {
    const date = certificateCompletionDate([
      { score: 70, completedAt: "2026-08-01T10:00:00Z" },
      { score: 76, completedAt: "2026-08-03T10:00:00Z" },
      { score: 82, completedAt: "2026-08-02T10:00:00Z" },
    ]);
    expect(date).toBe("2026-08-02T10:00:00Z");
  });

  it("returns null when no run passes", () => {
    expect(
      certificateCompletionDate([
        { score: 50, completedAt: "2026-08-01T10:00:00Z" },
        { score: 60, completedAt: "2026-08-02T10:00:00Z" },
      ]),
    ).toBeNull();
  });

  it("returns null for empty runs", () => {
    expect(certificateCompletionDate([])).toBeNull();
  });
});

describe("formatCertDate", () => {
  it("formats an ISO date as 'Aug 10, 2026'", () => {
    expect(formatCertDate("2026-08-10T12:00:00Z")).toBe("Aug 10, 2026");
  });

  it("passes through unparseable input", () => {
    expect(formatCertDate("not-a-date")).toBe("not-a-date");
  });
});

describe("certificateRecipientName", () => {
  it("prefers full_name metadata", () => {
    expect(
      certificateRecipientName({
        email: "alex@example.com",
        user_metadata: { full_name: "Alex Morgan" },
      }),
    ).toBe("Alex Morgan");
  });

  it("falls back to name then email then a generic label", () => {
    expect(
      certificateRecipientName({ email: "a@b.com", user_metadata: { name: "Sam" } }),
    ).toBe("Sam");
    expect(certificateRecipientName({ email: "a@b.com" })).toBe("a@b.com");
    expect(certificateRecipientName({})).toBe("Learner");
  });
});

describe("certificateCourseName", () => {
  it("uses the exact copy-deck course name for omni-studio-cert", () => {
    expect(certificateCourseName("omni-studio-cert", "OmniStudio Developer Certification")).toBe(
      "OmniStudio Developer Certification Prep",
    );
  });

  it("falls back to the series name for other series", () => {
    expect(certificateCourseName("agentic-ai", "Agentic AI")).toBe("Agentic AI");
  });
});

describe("getSeriesLessonSlugs", () => {
  it("returns all 46 planned lesson slugs for omni-studio-cert", () => {
    const slugs = getSeriesLessonSlugs("omni-studio-cert");
    expect(slugs.length).toBe(46);
    expect(slugs[0]).toMatch(/^day-01-/);
    expect(slugs[45]).toMatch(/^day-46-/);
  });

  it("returns [] for a series without tier questions", () => {
    expect(getSeriesLessonSlugs("no-such-series")).toEqual([]);
  });

  it("rejects traversal-ish series", () => {
    expect(getSeriesLessonSlugs("../etc")).toEqual([]);
  });
});
