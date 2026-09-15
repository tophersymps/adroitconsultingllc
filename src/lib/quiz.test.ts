/**
 * quiz.ts — tier lookup + quiz-name resolver tests (ADR-101).
 */
import { describe, it, expect } from "vitest";
import {
  getCertExam,
  getKnowledgeCheck,
  getKnowledgeChecks,
  getQuizForLesson,
  parseQuizName,
  resolveQuizByName,
  scoreQuizAttemptRows,
  scoreQuizAttemptsByQuiz,
} from "./quiz";

describe("parseQuizName", () => {
  it("parses a lesson tier name", () => {
    expect(
      parseQuizName("omni-studio-cert:lesson:day-01-f1-omnistudio-solution-and-industry-use-cases"),
    ).toEqual({
      series: "omni-studio-cert",
      tier: "lesson",
      id: "day-01-f1-omnistudio-solution-and-industry-use-cases",
    });
  });

  it("parses a check tier name", () => {
    expect(parseQuizName("omni-studio-cert:check:3")).toEqual({
      series: "omni-studio-cert",
      tier: "check",
      id: "3",
    });
  });

  it("parses an exam tier name (no id segment)", () => {
    expect(parseQuizName("omni-studio-cert:exam")).toEqual({
      series: "omni-studio-cert",
      tier: "exam",
      id: "exam",
    });
  });

  it("rejects bare series names, unknown tiers, and traversal-ish input", () => {
    expect(parseQuizName("omni-studio-cert")).toBeNull();
    expect(parseQuizName("omni-studio-cert:garbage:x")).toBeNull();
    expect(parseQuizName("../etc:lesson:x")).toBeNull();
    expect(parseQuizName("a:b:c:d")).toBeNull();
    expect(parseQuizName("")).toBeNull();
  });
});

describe("getKnowledgeChecks", () => {
  it("returns 9 check metas for omni-studio-cert with the canonical lesson ranges", () => {
    const checks = getKnowledgeChecks("omni-studio-cert");
    expect(checks.length).toBe(9);
    expect(checks[0]).toEqual({ n: 1, lessons: [1, 5] });
    expect(checks[8]).toEqual({ n: 9, lessons: [41, 45] });
    expect(checks.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("returns [] for a series without check files and rejects bad series", () => {
    expect(getKnowledgeChecks("no-such-series")).toEqual([]);
    expect(getKnowledgeChecks("../etc")).toEqual([]);
  });
});

describe("tier lookups", () => {
  it("loads a per-lesson quiz (3 questions) with the tier quizName", () => {
    const quiz = getQuizForLesson(
      "omni-studio-cert",
      "day-01-f1-omnistudio-solution-and-industry-use-cases",
    );
    expect(quiz).not.toBeNull();
    expect(quiz!.questions.length).toBe(3);
    expect(quiz!.quizName).toContain(":lesson:");
  });

  it("loads a knowledge check (15 questions) and the exam (60 questions)", () => {
    const check = getKnowledgeCheck("omni-studio-cert", 1);
    expect(check).not.toBeNull();
    expect(check!.questions.length).toBe(15);
    expect(check!.quizName).toBe("omni-studio-cert:check:1");

    const exam = getCertExam("omni-studio-cert");
    expect(exam).not.toBeNull();
    expect(exam!.questions.length).toBe(60);
    expect(exam!.quizName).toBe("omni-studio-cert:exam");
  });

  it("returns null for unknown series/slug/n", () => {
    expect(getQuizForLesson("omni-studio-cert", "no-such-lesson")).toBeNull();
    expect(getKnowledgeCheck("omni-studio-cert", 99)).toBeNull();
    expect(getCertExam("no-such-series")).toBeNull();
    expect(getQuizForLesson("../etc", "x")).toBeNull();
  });
});

describe("resolveQuizByName", () => {
  it("dispatches tier names to the right lookup", () => {
    const lesson = resolveQuizByName(
      "omni-studio-cert:lesson:day-01-f1-omnistudio-solution-and-industry-use-cases",
    );
    expect(lesson?.quizName).toContain(":lesson:");

    const check = resolveQuizByName("omni-studio-cert:check:1");
    expect(check?.quizName).toBe("omni-studio-cert:check:1");

    const exam = resolveQuizByName("omni-studio-cert:exam");
    expect(exam?.questions.length).toBe(60);
  });

  it("falls back to the legacy series quiz for bare series names", () => {
    // content/omni-studio-cert/questions.json was retired (Decision 8) —
    // bare-name fallback now returns null for omni-studio-cert.
    expect(resolveQuizByName("omni-studio-cert")).toBeNull();
    expect(resolveQuizByName("no-such-series")).toBeNull();
  });

  it("strictly rejects non-digit check ids (security F4 — check:3abc must not parse to 3)", () => {
    expect(resolveQuizByName("omni-studio-cert:check:3abc")).toBeNull();
    expect(resolveQuizByName("omni-studio-cert:check:3.0")).toBeNull();
    expect(resolveQuizByName("omni-studio-cert:check:-1")).toBeNull();
    // canonical digit-only id still resolves
    expect(resolveQuizByName("omni-studio-cert:check:1")?.quizName).toBe(
      "omni-studio-cert:check:1",
    );
  });
});

describe("scoreQuizAttemptRows / scoreQuizAttemptsByQuiz (F1/F2 source of truth)", () => {
  it("scores a set of graded rows (latest answer per question wins)", () => {
    const s = scoreQuizAttemptRows([
      { question_index: 0, is_correct: true },
      { question_index: 1, is_correct: true },
      { question_index: 1, is_correct: false }, // duplicate: latest wins → false
      { question_index: 2, is_correct: true },
    ]);
    expect(s).toEqual({ correct: 2, total: 3, score: 67 }); // 2/3 = 66.7 → 67
  });

  it("returns null for an empty row set (no graded answers)", () => {
    expect(scoreQuizAttemptRows([])).toBeNull();
  });

  it("ignores malformed rows", () => {
    expect(scoreQuizAttemptRows([{ question_index: 0, is_correct: true }, null as never])).toEqual(
      { correct: 1, total: 1, score: 100 },
    );
  });

  it("groups rows by quiz_name and scores each quiz independently", () => {
    const byQuiz = scoreQuizAttemptsByQuiz([
      { quiz_name: "s:check:1", question_index: 0, is_correct: true },
      { quiz_name: "s:check:1", question_index: 1, is_correct: true },
      { quiz_name: "s:exam", question_index: 0, is_correct: false },
    ]);
    expect(byQuiz.get("s:check:1")).toEqual({ correct: 2, total: 2, score: 100 });
    expect(byQuiz.get("s:exam")).toEqual({ correct: 0, total: 1, score: 0 });
  });

  it("omits quizzes with no rows from the grouped result", () => {
    expect(scoreQuizAttemptsByQuiz([]).size).toBe(0);
  });
});

describe("scoreQuizAttemptRows / scoreQuizAttemptsByQuiz canonical coverage (t_55105899 F2)", () => {
  it("rejects a partial attempt set when the canonical question count is known", () => {
    // 8 of a canonical 15 check questions, ALL correct — must NOT derive as
    // 8/8 = 100% (that was the exam-unlock forgery).
    const s = scoreQuizAttemptRows(
      Array.from({ length: 8 }, (_, i) => ({ question_index: i, is_correct: true })),
      15,
    );
    expect(s).toBeNull();
  });

  it("scores a full-coverage attempt set against the canonical count", () => {
    // 15 of 15 graded (14 correct) → 93%.
    const rows = Array.from({ length: 15 }, (_, i) => ({
      question_index: i,
      is_correct: i !== 14,
    }));
    expect(scoreQuizAttemptRows(rows, 15)).toEqual({ correct: 14, total: 15, score: 93 });
  });

  it("rejects a partial EXAM set (40 of 60, all correct) — certificate forgery", () => {
    // The certificate exploit: submit 40 known-correct exam answers; without
    // canonical coverage this derived as 40/40 = 100% ≥ 72. With coverage it
    // is null (not a valid score).
    const rows = Array.from({ length: 40 }, (_, i) => ({
      question_index: i,
      is_correct: true,
    }));
    expect(scoreQuizAttemptRows(rows, 60)).toBeNull();
  });

  it("scores a full exam set against 60 (40 correct → 67%, below pass)", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      question_index: i,
      is_correct: i < 40,
    }));
    expect(scoreQuizAttemptRows(rows, 60)).toEqual({ correct: 40, total: 60, score: 67 });
  });

  it("grouped scoring skips quizzes missing from the canonical map and partial sets", () => {
    const byQuiz = scoreQuizAttemptsByQuiz(
      [
        // check:1 — 8 of canonical 15 → partial → omitted (cannot grant).
        { quiz_name: "s:check:1", question_index: 0, is_correct: true },
        { quiz_name: "s:check:1", question_index: 1, is_correct: true },
        // check:2 — full 2-of-2 (canonical 2) → scored 100.
        { quiz_name: "s:check:2", question_index: 0, is_correct: true },
        { quiz_name: "s:check:2", question_index: 1, is_correct: true },
        // unknown quiz absent from the map → omitted.
        { quiz_name: "s:mystery", question_index: 0, is_correct: true },
      ],
      new Map([
        ["s:check:1", 15],
        ["s:check:2", 2],
      ]),
    );
    expect(byQuiz.has("s:check:1")).toBe(false);
    expect(byQuiz.has("s:mystery")).toBe(false);
    expect(byQuiz.get("s:check:2")).toEqual({ correct: 2, total: 2, score: 100 });
  });

  it("keeps legacy behavior when no canonical totals are supplied", () => {
    // Backward compat: callers without canonical knowledge (e.g. run route's
    // own explicit guard) still get the answered-count score.
    const s = scoreQuizAttemptRows([
      { question_index: 0, is_correct: true },
      { question_index: 1, is_correct: true },
    ]);
    expect(s).toEqual({ correct: 2, total: 2, score: 100 });
  });
});
