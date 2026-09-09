/**
 * useQuizProgress — unit tests (QA F-3).
 *
 * Coverage required by the QA report:
 *  - hydration-safe initial state (no localStorage read during render,
 *    SSR output is the empty/unhydrated state even when storage is seeded)
 *  - resetQuiz preserves bestScore + attemptCount (US-005 AC4)
 *  - run completion is session-scoped: attemptCount increments only when a
 *    submission completes the quiz, never on hydration/remount (QA F-2)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useQuizProgress, quizScorePercentage } from "./useQuizProgress";

const KEY = "adroit-blog:quiz:test-quiz";

function seedStorage(partial: Partial<{
  attempts: unknown[];
  total: number;
  correct: number;
  bestScore: number;
  attemptCount: number;
}> = {}) {
  const value = {
    attempts: [],
    total: 0,
    correct: 0,
    bestScore: 0,
    attemptCount: 0,
    ...partial,
  };
  localStorage.setItem(KEY, JSON.stringify(value));
  return value;
}

/** Probe that surfaces hook state — used for SSR renderToString checks. */
function Probe() {
  const { progress, hydrated } = useQuizProgress("test-quiz");
  return (
    <div>
      {hydrated
        ? `hydrated:${progress.attemptCount}:${progress.bestScore}`
        : "unhydrated"}
    </div>
  );
}

describe("useQuizProgress", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("hydrates from storage after mount and reports hydrated=true", async () => {
    seedStorage({ attemptCount: 4, bestScore: 90 });

    const { result } = renderHook(() => useQuizProgress("test-quiz"));

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.progress.attemptCount).toBe(4);
    expect(result.current.progress.bestScore).toBe(90);
  });

  it("is hydration-safe: SSR renders the empty state even when storage is seeded", () => {
    // The server renderer never runs effects — the useState initializer must
    // NOT touch localStorage, otherwise server HTML would diverge from the
    // client's first paint (QA F-1 root cause).
    seedStorage({ attemptCount: 7, bestScore: 100 });

    const html = renderToString(<Probe />);
    expect(html).toContain("unhydrated");
    expect(html).not.toContain("hydrated:7:100");
  });

  it("resetQuiz preserves bestScore + attemptCount while clearing attempts", async () => {
    seedStorage({
      attempts: [
        {
          quizName: "test-quiz",
          questionIndex: 0,
          userAnswer: 1,
          correctAnswer: 1,
          isCorrect: true,
          attemptedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      total: 1,
      correct: 1,
      bestScore: 80,
      attemptCount: 3,
    });

    const { result } = renderHook(() => useQuizProgress("test-quiz"));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.resetQuiz());

    expect(result.current.progress).toMatchObject({
      attempts: [],
      total: 0,
      correct: 0,
      bestScore: 80,
      attemptCount: 3,
    });
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    expect(stored).toMatchObject({ bestScore: 80, attemptCount: 3, total: 0 });
  });

  it("completeRun updates bestScore (max) and increments attemptCount", async () => {
    seedStorage({
      attempts: [
        { quizName: "test-quiz", questionIndex: 0, userAnswer: 1, correctAnswer: 1, isCorrect: true, attemptedAt: "2026-08-01T00:00:00.000Z" },
        { quizName: "test-quiz", questionIndex: 1, userAnswer: 0, correctAnswer: 1, isCorrect: false, attemptedAt: "2026-08-01T00:00:00.000Z" },
        { quizName: "test-quiz", questionIndex: 2, userAnswer: 1, correctAnswer: 1, isCorrect: true, attemptedAt: "2026-08-01T00:00:00.000Z" },
        { quizName: "test-quiz", questionIndex: 3, userAnswer: 1, correctAnswer: 1, isCorrect: true, attemptedAt: "2026-08-01T00:00:00.000Z" },
        { quizName: "test-quiz", questionIndex: 4, userAnswer: 0, correctAnswer: 1, isCorrect: false, attemptedAt: "2026-08-01T00:00:00.000Z" },
      ],
      total: 5,
      correct: 3,
      bestScore: 40,
      attemptCount: 2,
    });

    const { result } = renderHook(() => useQuizProgress("test-quiz"));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.completeRun());

    // 3/5 = 60% > 40% → bestScore becomes 60, attemptCount 2 → 3
    expect(result.current.progress.bestScore).toBe(60);
    expect(result.current.progress.attemptCount).toBe(3);
  });

  it("completeRun does NOT lower bestScore when the new run scores worse", async () => {
    seedStorage({
      attempts: [
        { quizName: "test-quiz", questionIndex: 0, userAnswer: 1, correctAnswer: 1, isCorrect: true, attemptedAt: "2026-08-01T00:00:00.000Z" },
      ],
      total: 1,
      correct: 1,
      bestScore: 100,
      attemptCount: 1,
    });

    const { result } = renderHook(() => useQuizProgress("test-quiz"));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.completeRun());

    expect(result.current.progress.bestScore).toBe(100);
    expect(result.current.progress.attemptCount).toBe(2);
  });

  it("submitAnswer records a run exactly once when the quiz becomes fully answered", async () => {
    const { result } = renderHook(() => useQuizProgress("test-quiz", 3));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.submitAnswer(0, 1, 1));
    act(() => result.current.submitAnswer(1, 1, 1));
    expect(result.current.progress.attemptCount).toBe(0); // not complete yet

    act(() => result.current.submitAnswer(2, 1, 1));
    expect(result.current.progress.attemptCount).toBe(1); // complete → +1
    expect(result.current.progress.bestScore).toBe(100);
    expect(result.current.progress.total).toBe(3);
    expect(result.current.progress.correct).toBe(3);
  });

  it("submitAnswer with skipSync suppresses the attempt-sync POST (server-graded mode, t_79a92b83)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { result } = renderHook(() => useQuizProgress("test-quiz"));
      await waitFor(() => expect(result.current.hydrated).toBe(true));

      // Server-graded flow: the grading POST already upserted quiz_attempt —
      // the hook must NOT fire a duplicate sync POST (rate limit 30/min).
      act(() => result.current.submitAnswer(0, 1, 1, { skipSync: true }));
      expect(fetchMock).not.toHaveBeenCalled();

      // Default path (lesson client-graded mode) still syncs.
      act(() => result.current.submitAnswer(1, 1, 1));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/progress/quiz");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("remounting with an already-completed quiz does NOT inflate attemptCount (QA F-2)", async () => {
    // Simulates the page being reloaded with a finished quiz in storage:
    // hydration alone must not fire completeRun.
    seedStorage({
      attempts: [0, 1, 2].map((i) => ({
        quizName: "test-quiz",
        questionIndex: i,
        userAnswer: 1,
        correctAnswer: 1,
        isCorrect: true,
        attemptedAt: "2026-08-01T00:00:00.000Z",
      })),
      total: 3,
      correct: 3,
      bestScore: 100,
      attemptCount: 2,
    });

    const first = renderHook(() => useQuizProgress("test-quiz", 3));
    await waitFor(() => expect(first.result.current.hydrated).toBe(true));
    expect(first.result.current.progress.attemptCount).toBe(2);

    first.unmount();

    const second = renderHook(() => useQuizProgress("test-quiz", 3));
    await waitFor(() => expect(second.result.current.hydrated).toBe(true));
    expect(second.result.current.progress.attemptCount).toBe(2);

    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    expect(stored.attemptCount).toBe(2);
  });

  it("quizScorePercentage returns 0 for an empty quiz and rounds correctly", () => {
    expect(quizScorePercentage({ attempts: [], total: 0, correct: 0, bestScore: 0, attemptCount: 0 })).toBe(0);
    expect(quizScorePercentage({ attempts: [], total: 5, correct: 3, bestScore: 0, attemptCount: 0 })).toBe(60);
  });
});
