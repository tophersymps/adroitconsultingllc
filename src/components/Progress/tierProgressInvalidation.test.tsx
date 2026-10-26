/**
 * Freshness regression (t_499542c6) — WIRING side.
 *
 * The hook's own cache tests live in `useTierProgress.test.tsx`; this file
 * pins the other half of the contract: every flow that MUTATES the series
 * rollup must invalidate it, or the module cache serves the PRE-submit rollup
 * when the results view's client-side "Back to series" Link navigates without
 * a document reload (A4 regression reported by Zod on t_020d2f04).
 *
 *   - QuizWidget (knowledge check) → invalidateTierProgress(series) on a
 *     successful grading POST
 *   - ExamWidget → invalidateTierProgress(seriesSlug) on a successful batch
 *     submit
 *   - useLessonProgress.markComplete (MarkComplete toggle / lesson-quiz perfect
 *     score) → invalidateAllTierProgress(), because that hook only knows the
 *     lesson slug
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  invalidateAllTierProgress,
  invalidateTierProgress,
} from "@/lib/hooks/useTierProgress";
import type { ClientSafeQuestion } from "./QuizWidget";
import type { QuizQuestion } from "@/shared/contracts";
import QuizWidget from "./QuizWidget";
import ExamWidget from "./ExamWidget";
import MarkComplete from "./MarkComplete";

// Keep the real hook/cache; only spy on the invalidation entry points.
vi.mock("@/lib/hooks/useTierProgress", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/hooks/useTierProgress")>();
  return {
    ...actual,
    invalidateTierProgress: vi.fn(actual.invalidateTierProgress),
    invalidateAllTierProgress: vi.fn(actual.invalidateAllTierProgress),
  };
});


const SERIES = "omni-studio-cert";

const STRIPPED: ClientSafeQuestion[] = [
  { question: "Pick Alpha", options: ["Alpha", "Beta", "Gamma", "Delta"] },
];

const EXAM_QUESTIONS: Pick<QuizQuestion, "question" | "options">[] = [
  { question: "Pick Alpha", options: ["Alpha", "Beta"] },
];

beforeEach(() => {
  localStorage.clear();
  vi.mocked(invalidateTierProgress).mockClear();
  vi.mocked(invalidateAllTierProgress).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("rollup-mutating flows invalidate the tier progress cache", () => {
  it("QuizWidget drops the series entry after a graded check answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ok",
          result: { isCorrect: true, correctAnswerIndex: 0, explanation: "Because Alpha." },
        }),
      }),
    );

    render(
      <QuizWidget
        quizName="check-quiz-1"
        questions={STRIPPED}
        serverGraded
        seriesSlug={SERIES}
        passThreshold={80}
      />,
    );

    fireEvent.click(screen.getAllByRole("radio")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    await screen.findByText(/Because Alpha/);
    expect(invalidateTierProgress).toHaveBeenCalledWith(SERIES);
  });

  it("QuizWidget leaves the cache alone when no series is in scope (lesson quiz)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ok",
          result: { isCorrect: true, correctAnswerIndex: 0, explanation: "Because Alpha." },
        }),
      }),
    );

    render(<QuizWidget quizName="lesson-quiz" questions={STRIPPED} serverGraded />);

    fireEvent.click(screen.getAllByRole("radio")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    await screen.findByText(/Because Alpha/);
    expect(invalidateTierProgress).not.toHaveBeenCalled();
  });

  it("ExamWidget drops the series entry after a successful batch submit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          score: 100,
          correct: 1,
          total: 1,
          passed: true,
          results: [{ questionIndex: 0, isCorrect: true, correctAnswerIndex: 0 }],
        }),
      }),
    );

    render(
      <ExamWidget
        quizName="exam-quiz"
        questions={EXAM_QUESTIONS}
        seriesSlug={SERIES}
        seriesName="Omni Studio"
        kind="certification-prep"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Submit exam/ }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Exam results" })).toBeInTheDocument(),
    );
    expect(invalidateTierProgress).toHaveBeenCalledWith(SERIES);
  });

  it("MarkComplete drops every series entry (lesson complete changes the rollup)", async () => {
    render(<MarkComplete lessonSlug="lesson-7" />);

    const toggle = await screen.findByRole("button", { name: /complete/i });
    fireEvent.click(toggle);

    await waitFor(() => expect(invalidateAllTierProgress).toHaveBeenCalled());
  });
});
