/**
 * useQuizProgress — client hook for tracking quiz attempt state.
 *
 * Per ADR-004: quiz data stays client-side (localStorage).
 * Namespaced localStorage keys: adroit-blog:quiz:<quizName>
 *
 * Hydration safety (QA F-1): localStorage is NEVER read in the useState
 * initializer. Both server and first client render start from the empty
 * state so first paint matches; the stored value is read in a post-mount
 * effect and `hydrated` flips true afterwards. Consumers render nothing /
 * a placeholder until `hydrated` is true.
 *
 * Session-scoped run completion (QA F-2): a completed run is recorded
 * inside submitAnswer when the submitted attempt makes the quiz fully
 * answered. There is no "quiz became complete" effect, so reloading a
 * page with an already-completed quiz can never re-fire completion and
 * inflate attemptCount — only an actual submission in this session can.
 *
 * Score preservation (BA requirement, US-005 AC4): the current run's
 * per-question attempts are cleared on retake, but `bestScore` and
 * `attemptCount` (completed runs) are preserved so the original score
 * is never wiped.
 */
"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY_PREFIX = "adroit-blog:quiz:";

interface QuizAttempt {
  quizName: string;
  questionIndex: number;
  userAnswer: number;
  correctAnswer: number;
  isCorrect: boolean;
  attemptedAt: string;
}

interface QuizProgress {
  attempts: QuizAttempt[];
  total: number;
  correct: number;
  /** Best completed-run score as a percentage (0-100). */
  bestScore: number;
  /** Number of completed full runs (retakes increment this). */
  attemptCount: number;
}

interface UseQuizProgressReturn {
  progress: QuizProgress;
  /**
   * True once the stored quiz state has been read after mount. Render
   * nothing / a placeholder until this is true (QA F-1 hydration gate).
   */
  hydrated: boolean;
  submitAnswer: (
    questionIndex: number,
    userAnswer: number,
    correctAnswer: number,
    options?: { skipSync?: boolean },
  ) => void;
  resetQuiz: () => void;
  /** Record a completed run (updates bestScore/attemptCount + syncs stats). */
  completeRun: () => void;
}

function getQuizFromStorage(quizName: string): QuizProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${quizName}`);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as QuizProgress;
    // Backfill older stored shapes that predate bestScore/attemptCount
    if (typeof parsed.bestScore !== "number") parsed.bestScore = 0;
    if (typeof parsed.attemptCount !== "number") parsed.attemptCount = 0;
    return parsed;
  } catch {
    return null;
  }
}

function setQuizInStorage(quizName: string, progress: QuizProgress): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${quizName}`, JSON.stringify(progress));
  } catch {
    // silent fail
  }
}

/** Fire-and-forget sync of a single quiz attempt to Supabase (authed only). */
async function syncAttemptAPI(attempt: QuizAttempt): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/progress/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quizName: attempt.quizName,
        questionIndex: attempt.questionIndex,
        userAnswerIndex: attempt.userAnswer,
        correctAnswerIndex: attempt.correctAnswer,
        isCorrect: attempt.isCorrect,
      }),
    });
  } catch {
    // fire-and-forget — localStorage remains authoritative
  }
}

/** Fire-and-forget sync of a completed quiz run (score stats). */
async function syncRunAPI(quizName: string, correct: number, total: number): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/progress/quiz/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizName, correct, total }),
    });
  } catch {
    // fire-and-forget — localStorage remains authoritative
  }
}

function emptyProgress(): QuizProgress {
  return { attempts: [], total: 0, correct: 0, bestScore: 0, attemptCount: 0 };
}

/**
 * @param quizName    Storage namespace (series slug — matches QuizStats).
 * @param totalQuestions Optional question count. When provided, submitting
 *   the answer that completes the quiz records the run (bestScore +
 *   attemptCount + run sync) atomically in submitAnswer — session-scoped,
 *   so page reloads of a completed quiz never inflate attemptCount (QA F-2).
 */
export function useQuizProgress(
  quizName: string,
  totalQuestions?: number,
): UseQuizProgressReturn {
  // Hydration-safe: always start empty; read storage only after mount.
  const [progress, setProgress] = useState<QuizProgress>(emptyProgress);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = getQuizFromStorage(quizName);
    // Mount-gate hydration read (QA F-1): the documented React pattern for
    // client-only data — read AFTER mount so the server HTML and the
    // client's first paint both render the empty state. The one-time setState
    // here is intentional (post-hydration external-store read), which the
    // react-hooks/set-state-in-effect heuristic does not account for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setProgress(stored);
    setHydrated(true);
  }, [quizName]);

  const submitAnswer = useCallback(
    (
      questionIndex: number,
      userAnswer: number,
      correctAnswer: number,
      options?: { skipSync?: boolean },
    ) => {
      if (!hydrated) return;
      const isCorrect = userAnswer === correctAnswer;
      const attempt: QuizAttempt = {
        quizName,
        questionIndex,
        userAnswer,
        correctAnswer,
        isCorrect,
        attemptedAt: new Date().toISOString(),
      };
      const newAttempts = [...progress.attempts, attempt];
      const correctCount = newAttempts.filter((a) => a.isCorrect).length;

      // Session-scoped run completion: only when THIS submission makes the
      // quiz fully answered do we record a completed run. A reload of an
      // already-completed quiz never reaches submitAnswer, so attemptCount
      // cannot inflate on refresh/back-navigation (QA F-2).
      let bestScore = progress.bestScore;
      let attemptCount = progress.attemptCount;
      if (typeof totalQuestions === "number" && totalQuestions > 0) {
        const answeredIndexes = new Set(newAttempts.map((a) => a.questionIndex));
        if (answeredIndexes.size >= totalQuestions) {
          const pct = Math.round((correctCount / newAttempts.length) * 100);
          bestScore = Math.max(progress.bestScore, pct);
          attemptCount = progress.attemptCount + 1;
          syncRunAPI(quizName, correctCount, newAttempts.length);
        }
      }

      const newProgress: QuizProgress = {
        attempts: newAttempts,
        total: newAttempts.length,
        correct: correctCount,
        bestScore,
        attemptCount,
      };
      setProgress(newProgress);
      setQuizInStorage(quizName, newProgress);
      // Server-graded mode (t_79a92b83): the grading POST already upserted
      // the quiz_attempt row — skip the duplicate sync to stay well under the
      // 30/min rate limit (a 15-question check would otherwise burn 2×15).
      if (!options?.skipSync) {
        syncAttemptAPI(attempt);
      }
    },
    [progress, quizName, hydrated, totalQuestions],
  );

  const resetQuiz = useCallback(() => {
    if (!hydrated) return;
    // Preserve bestScore + attemptCount — retaking must not wipe the
    // original score (BA requirement, US-005 AC4).
    const newProgress: QuizProgress = {
      attempts: [],
      total: 0,
      correct: 0,
      bestScore: progress.bestScore,
      attemptCount: progress.attemptCount,
    };
    setProgress(newProgress);
    setQuizInStorage(quizName, newProgress);
  }, [progress.bestScore, progress.attemptCount, quizName, hydrated]);

  const completeRun = useCallback(() => {
    if (!hydrated || progress.total === 0) return;
    const pct = quizScorePercentage(progress);
    const newProgress: QuizProgress = {
      ...progress,
      bestScore: Math.max(progress.bestScore, pct),
      attemptCount: progress.attemptCount + 1,
    };
    setProgress(newProgress);
    setQuizInStorage(quizName, newProgress);
    syncRunAPI(quizName, progress.correct, progress.total);
  }, [progress, quizName, hydrated]);

  return { progress, hydrated, submitAnswer, resetQuiz, completeRun };
}

/** Score a completed run (0-100) — used by QuizWidget to persist stats. */
export function quizScorePercentage(progress: QuizProgress): number {
  if (progress.total === 0) return 0;
  return Math.round((progress.correct / progress.total) * 100);
}
