/**
 * QuizWidget — interactive multiple-choice quiz component.
 *
 * Matches design/mockup-quiz.html + copy-deck-quiz-tiers.md §1/§2: segment
 * progress bar, 4-option MCQ with radio states (selected / correct / wrong /
 * correct-unselected), "Why" explanation panel, and a score-ring results card.
 * Uses useQuizProgress hook for localStorage-only state (ADR-004).
 *
 * Reused by the lesson quiz embed and the knowledge-check pages. Optional
 * props adapt it to each tier (copy deck):
 *   - kicker       "Quiz · Lesson {N}" (lesson) / "Knowledge Check {N} · 15 questions" (check)
 *   - passThreshold  80 for checks → results show pass/fail verdict pill
 *                    (emerald ring + "Passed · 80% required"; red + "Keep going");
 *                    exactly 80.0 shows "Passed — 80 flat counts" (boundary).
 *   - retakeLabel  "Retake quiz" (lesson) / "Retake check" (check)
 *   - backHref/backLabel  "Back to lesson" / "Back to series" link in results
 *   - serverGraded True for knowledge checks (security t_79a92b83 F2 /
 *     CWE-200): the page ships `{question, options}` ONLY — no
 *     correct_answer_index/explanation in the RSC payload. Each answer is
 *     POSTed to /api/progress/quiz, which grades it server-side and returns
 *     { isCorrect, correctAnswerIndex, explanation } for that question; the
 *     widget renders feedback from the response, never from a client-side key.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuizProgress } from "@/lib/hooks/useQuizProgress";
import { trackQuizTierComplete } from "@/lib/analytics";

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer_index: number;
  explanation?: string;
}

/**
 * Client-safe question shape — what server-graded pages ship to the widget.
 * Deliberately stripped of the answer key (correct_answer_index, explanation)
 * server-side (security t_79a92b83 F2 / CWE-200); grading feedback comes from
 * POST /api/progress/quiz responses, never from the payload.
 */
export interface ClientSafeQuestion {
  question: string;
  options: string[];
}

/** Per-question grading result returned by POST /api/progress/quiz. */
interface GradeResult {
  isCorrect: boolean;
  correctAnswerIndex: number;
  explanation?: string;
}

interface QuizWidgetProps {
  quizName: string;
  /**
   * Full questions (client-graded lesson mode) OR stripped {question, options}
   * (serverGraded check mode — the answer key must never reach this prop).
   */
  questions: QuizQuestion[] | ClientSafeQuestion[];
  /** Card kicker after the red tick (copy deck §1/§2). Defaults to "Quiz". */
  kicker?: string;
  /** Pass threshold (0-100). When set, results show a pass/fail verdict pill. */
  passThreshold?: number;
  /** Retake button label (default "Retake quiz"). */
  retakeLabel?: string;
  /** Optional "Back to …" link shown with the retake button in results. */
  backHref?: string;
  /** Back button label (default "Back"). */
  backLabel?: string;
  /**
   * Server-graded mode (knowledge checks, t_79a92b83): the payload carries no
   * answer key; each answer is POSTed to /api/progress/quiz and feedback
   * (correct/wrong styling, explanation) is rendered from the response.
   */
  serverGraded?: boolean;
  /**
   * Lesson-tier opt-in: fired once when a run completes PERFECT (all answers
   * correct) in this session — used to auto-mark the lesson complete. Guests
   * and reloads of an already-perfect quiz never fire it (session-scoped).
   */
  onPerfectScore?: () => void;
}

export default function QuizWidget({
  quizName,
  questions,
  kicker = "Quiz",
  passThreshold,
  retakeLabel = "Retake quiz",
  backHref,
  backLabel = "Back",
  serverGraded = false,
  onPerfectScore,
}: QuizWidgetProps) {
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [grading, setGrading] = useState(false);
  // Server-graded mode (t_79a92b83): per-question grading results returned by
  // POST /api/progress/quiz. The widget renders correct/wrong styling and the
  // explanation from these — the payload never carries the answer key.
  const [gradedResults, setGradedResults] = useState<Record<number, GradeResult>>({});
  const [gradeError, setGradeError] = useState(false);
  // Track the pending "Grading…" timeout so advancing/retaking can clear it —
  // otherwise the 350ms beat fires after the user has moved on and flips
  // showExplanation for the WRONG question.
  const gradingTimeoutRef = useRef<number | null>(null);
  // True when the LAST question was answered in this session (copy deck §1:
  // Q3 shows a "See results" button instead of auto-jumping). A returning
  // user with a completed quiz in storage still sees results directly (QA F-2).
  // State (not a ref) because it gates the results view during render.
  const [completedThisSession, setCompletedThisSession] = useState(false);
  // Score ring Moment fill (QA M-2): starts 0 and animates to the final
  // dasharray once the results view mounts — setting the final value at
  // mount meant the CSS transition had no from→to change and never played.
  const [ringFilled, setRingFilled] = useState(false);
  // Progress-funnel analytics (B-06): fire the quiz-tier event exactly once
  // per session that reaches results. Ref guard, not state, so a re-render of
  // the results view can't double-fire.
  const quizTierFiredRef = useRef(false);

  const { progress, hydrated, submitAnswer, resetQuiz } = useQuizProgress(
    quizName,
    questions.length,
  );

  const answeredIndexes = new Set(
    progress.attempts.map((a) => a.questionIndex),
  );
  const isAnswered = answeredIndexes.has(currentQ);
  const question = questions[currentQ];

  const allAnswered = questions.length > 0 && questions.every((_, i) => answeredIndexes.has(i));

  // Score ring Moment fill (QA M-2): when the results view becomes visible,
  // flip ringFilled on the next animation frame so the CSS transition has a
  // from→to pair (0 → final dasharray) and actually plays. Retake resets it
  // in the handler so every completion re-animates. Same gating as the results
  // view itself — an in-session last-answer (showing "See results") does not
  // pre-arm the ring.
  useEffect(() => {
    if (!hydrated) return;
    const showResults =
      (allAnswered && !completedThisSession) ||
      currentQ >= questions.length;
    if (showResults) {
      const raf = requestAnimationFrame(() => setRingFilled(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [allAnswered, currentQ, questions.length, hydrated, completedThisSession]);

  // Progress-funnel analytics (B-06): fire the quiz-tier event exactly once per
  // session once the results view is reached (quiz tier in the lesson → quiz →
  // exam → certificate funnel). Scored from the progress store so a returning
  // user who sees results directly still registers a complete.
  useEffect(() => {
    if (!hydrated || quizTierFiredRef.current) return;
    const showResults =
      (allAnswered && !completedThisSession) ||
      currentQ >= questions.length;
    if (!showResults) return;
    const score =
      progress.total > 0 ? Math.round((progress.correct / progress.total) * 100) : 0;
    const passed = typeof passThreshold === "number" && score >= passThreshold;
    quizTierFiredRef.current = true;
    trackQuizTierComplete({ quizName, score, passed });
  }, [allAnswered, currentQ, questions.length, hydrated, completedThisSession, progress.correct, progress.total, quizName, passThreshold]);

  // Lesson-tier auto-complete (topherdev 2026-09-06): when a run completes
  // PERFECT (all answers correct) in this session, fire the opt-in callback so
  // the owning component can mark the lesson complete. Session-scoped (gated on
  // completedThisSession) so a returning user who reloads an already-perfect
  // quiz — or a guest — never triggers it, and it fires at most once per run.
  // A retake that is perfect counts as a fresh session fire; the write is an
  // idempotent upsert and the consumer guards against re-marking an already
  // complete lesson.
  const perfectScoreFiredRef = useRef(false);
  useEffect(() => {
    if (!onPerfectScore || !hydrated || perfectScoreFiredRef.current) return;
    const showResults =
      (allAnswered && !completedThisSession) ||
      currentQ >= questions.length;
    if (!showResults) return;
    if (progress.total > 0 && progress.correct === progress.total && completedThisSession) {
      perfectScoreFiredRef.current = true;
      onPerfectScore();
    }
  }, [onPerfectScore, hydrated, allAnswered, completedThisSession, currentQ, questions.length, progress.correct, progress.total]);

  // Hydration gate (QA F-1): before the stored quiz state has been read
  // after mount, render a placeholder instead of the question/results view.
  // This keeps server HTML and the client's first paint identical — the
  // server always renders the empty state, and the client does too until
  // useQuizProgress has hydrated. Avoids the "Hydration failed because the
  // server rendered HTML didn't match the client" error for returning users.
  if (!hydrated) {
    return (
      <div className="mt-8 max-w-[640px] rounded-[20px] border border-gray-200 bg-white p-7 shadow-sm dark:border-[var(--border-default)] dark:bg-[var(--surface-card)]">
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-red uppercase tracking-[0.08em] mb-1.5">
          <span className="w-[3px] h-3 rounded-sm bg-red" />
          {kicker}
        </div>
        <div className="h-4 w-1/3 rounded bg-gray-100 animate-pulse mb-4 dark:bg-[var(--surface-sunken)]" />
        <div className="h-4 w-full rounded bg-gray-100 animate-pulse mb-2 dark:bg-[var(--surface-sunken)]" />
        <div className="h-4 w-5/6 rounded bg-gray-100 animate-pulse mb-6 dark:bg-[var(--surface-sunken)]" />
        <div className="flex flex-col gap-2.5 mb-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-[14px] bg-gray-100 animate-pulse dark:bg-[var(--surface-sunken)]" />
          ))}
        </div>
        <div className="h-11 w-2/3 rounded-xl bg-gray-100 animate-pulse dark:bg-[var(--surface-sunken)]" />
        <span className="sr-only">Loading quiz…</span>
      </div>
    );
  }

  function handleSelect(index: number) {
    if (isAnswered || grading) return;
    setSelected(index);
    if (gradeError) setGradeError(false);
  }

  // WAI-ARIA radiogroup arrow-key roving (QA F-4): ArrowDown/Right move to
  // the next option, ArrowUp/Left to the previous, wrapping around. The
  // newly focused option becomes selected (automatic-activation pattern).
  function handleRadiogroupKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (isAnswered) return; // options disabled after submission
    const dir =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (dir === 0) return;
    event.preventDefault();
    const optionCount = question.options.length;
    const start = selected === null ? -1 : selected;
    const next = (start + dir + optionCount) % optionCount;
    handleSelect(next);
    document.getElementById(`quiz-option-${quizName}-${currentQ}-${next}`)?.focus();
  }

  // "Grading…" + spinner (copy deck §1): hold the grading state a beat (API
  // sync is in flight server-side) before recording the attempt + revealing
  // the explanation, so the copy-deck affordance is actually visible. The
  // timeout is cleared on advance/retake so it can't fire for the wrong question.
  function handleSubmit() {
    if (selected === null || !question || grading) return;
    if (serverGraded) {
      void gradeAndSubmit();
      return;
    }
    setGrading(true);
    if (gradingTimeoutRef.current !== null) {
      window.clearTimeout(gradingTimeoutRef.current);
    }
    gradingTimeoutRef.current = window.setTimeout(() => {
      const completesNow =
        !answeredIndexes.has(currentQ) &&
        answeredIndexes.size + 1 >= questions.length;
      submitAnswer(
        currentQ,
        selected,
        (question as QuizQuestion).correct_answer_index,
      );
      if (completesNow) setCompletedThisSession(true);
      setGrading(false);
      setShowExplanation(true);
      gradingTimeoutRef.current = null;
    }, 350);
  }

  // Server-graded submit (knowledge checks, t_79a92b83 F2 / CWE-200): POST the
  // answer to /api/progress/quiz — the payload carries NO correctAnswerIndex /
  // isCorrect (the server grades from canonical JSON) — and render feedback
  // from the response. The 350ms minimum beat keeps the copy-deck "Grading…"
  // affordance visible while the request is in flight. On failure the question
  // stays open (isAnswered stays false) so the user can retry.
  async function gradeAndSubmit() {
    if (selected === null || !question || grading) return;
    setGrading(true);
    setGradeError(false);
    try {
      const [resp] = await Promise.all([
        fetch("/api/progress/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quizName,
            questionIndex: currentQ,
            userAnswerIndex: selected,
          }),
        }).then((r) => r.json()),
        new Promise<void>((resolve) => window.setTimeout(resolve, 350)),
      ]);
      const result = (resp as { status?: string; result?: GradeResult }).result;
      if (!result || typeof result.isCorrect !== "boolean") {
        setGradeError(true);
        return;
      }
      setGradedResults((prev) => ({
        ...prev,
        [currentQ]: {
          isCorrect: result.isCorrect,
          correctAnswerIndex: result.correctAnswerIndex,
          explanation: result.explanation,
        },
      }));
      const completesNow =
        !answeredIndexes.has(currentQ) &&
        answeredIndexes.size + 1 >= questions.length;
      // skipSync: the grading POST above already upserted the quiz_attempt row —
      // a second sync POST would double the rate-limit load (30/min per IP).
      submitAnswer(currentQ, selected, result.correctAnswerIndex, { skipSync: true });
      if (completesNow) setCompletedThisSession(true);
      setShowExplanation(true);
    } catch {
      setGradeError(true);
    } finally {
      setGrading(false);
    }
  }

  function handleNext() {
    if (gradingTimeoutRef.current !== null) {
      window.clearTimeout(gradingTimeoutRef.current);
      gradingTimeoutRef.current = null;
    }
    setGrading(false);
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
      setSelected(null);
      setShowExplanation(false);
    } else {
      setCurrentQ(questions.length); // jump to results
    }
  }

  const runScore = progress.total > 0 ? Math.round((progress.correct / progress.total) * 100) : 0;
  const passed = typeof passThreshold === "number" && runScore >= passThreshold;
  // Lesson quiz ring: emerald at ≥60% (mockup-lesson-quiz.html JS); check:
  // emerald on pass (≥ threshold), red otherwise (mockup-check.html).
  const ringColor =
    typeof passThreshold === "number"
      ? passed
        ? "var(--signal-done)"
        : "var(--color-red, #C8102E)"
      : runScore >= 60
        ? "var(--signal-done)"
        : "var(--color-red, #C8102E)";

  // Results view — show directly for returning users with a completed quiz in
  // storage (QA F-2), but NOT when the last answer was just submitted in this
  // session (copy deck §1: Q3 shows "See results" first, then jumps here).
  if (
    (allAnswered && !completedThisSession) ||
    currentQ >= questions.length
  ) {
    return (
      <div className="mt-8 max-w-[640px]">
        <div className="rounded-[20px] border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-[var(--border-default)] dark:bg-[var(--surface-card)]">
          {/* Score ring */}
          <h2 className="sr-only">Quiz results</h2>
          <div className="relative w-32 h-32 mx-auto mb-4">
            <svg
              viewBox="0 0 128 128"
              className="w-full h-full -rotate-90"
              role="img"
              aria-label={`${progress.correct} of ${progress.total} questions correct`}
            >
              <circle
                cx="64"
                cy="64"
                r="54"
                fill="none"
                stroke="var(--color-gray-200, #E5E7EB)"
                strokeWidth="10"
              />
              <circle
                cx="64"
                cy="64"
                r="54"
                fill="none"
                stroke={ringColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${ringFilled && progress.total > 0 ? (progress.correct / progress.total) * 339.3 : 0} 339.3`}
                className="transition-[stroke-dasharray] duration-[450ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-mono text-[1.75rem] font-extrabold text-navy tabular-nums">
              {progress.correct}/{progress.total}
            </div>
          </div>

          {/* Pass/fail verdict pill (checks — copy deck §2) */}
          {typeof passThreshold === "number" && (
            <div
              className={`inline-flex items-center gap-2 font-mono text-[12px] font-bold px-4 py-1.5 rounded-full mb-4 ${
                passed ? "bg-emerald/10 text-emerald-800 dark:bg-emerald/15 dark:text-emerald-300" : "bg-[#FDE8EB] text-red-dark dark:bg-red/15 dark:text-red-300"
              }`}
            >
              {passed ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              )}
              {runScore === passThreshold
                ? "Passed — 80 flat counts"
                : passed
                  ? `Passed · ${passThreshold}% required`
                  : `Keep going — ${passThreshold}% required`}
            </div>
          )}

          <p className="text-[12.5px] text-gray-500 mb-6">
            {progress.total === 0
              ? "No answers yet."
              : progress.correct === progress.total
                ? "Perfect score — all questions answered correctly."
                : `${runScore}% correct — review the explanations below.`}
          </p>

          {/* Preserved score + attempt history (US-005 AC4 / copy deck) */}
          {progress.attemptCount > 0 && (
            <div className="flex items-center justify-center gap-4 mb-5 font-mono text-[10.5px] font-semibold text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald" />
                Best score · {progress.attemptCount}{" "}
                {progress.attemptCount === 1 ? "attempt" : "attempts"}
                {typeof passThreshold === "number" && !passed ? " · retake to pass" : ""}
              </span>
            </div>
          )}

          {/* Review list */}
          <div className="text-left mb-6">
            {questions.map((q, i) => {
              const attempt = progress.attempts.find((a) => a.questionIndex === i);
              const correct = attempt?.isCorrect ?? false;
              return (
                <div
                  key={i}
                  className="flex items-start gap-2.5 py-2.5 border-b border-gray-100 text-[12.5px] last:border-0 dark:border-[var(--border-subtle)]"
                >
                  <svg
                    aria-hidden="true"
                    className="w-4 h-4 mt-0.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={correct ? "var(--signal-done)" : "var(--color-gray-400, #9CA3AF)"}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {correct ? (
                      <path d="M20 6L9 17l-5-5" />
                    ) : (
                      <circle cx="12" cy="12" r="9" />
                    )}
                  </svg>
                  <span className="text-gray-600 leading-relaxed">
                    {i + 1}. {q.question}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2.5">
            {backHref && (
              <Link
                href={backHref}
                className="flex-1 h-11 rounded-xl border-[1.5px] border-gray-200 bg-white text-gray-600 text-[13.5px] font-bold no-underline flex items-center justify-center cursor-pointer hover:border-navy hover:text-navy active:scale-[0.98] transition-all duration-150 dark:border-[var(--border-default)] dark:bg-[var(--surface-card)] dark:hover:border-[var(--ink-primary)] dark:hover:text-[var(--ink-primary)]"
              >
                {backLabel}
              </Link>
            )}
            <button
              onClick={() => {
                if (gradingTimeoutRef.current !== null) {
                  window.clearTimeout(gradingTimeoutRef.current);
                  gradingTimeoutRef.current = null;
                }
                setGrading(false);
                setCompletedThisSession(false);
                resetQuiz();
                setCurrentQ(0);
                setSelected(null);
                setShowExplanation(false);
                setRingFilled(false); // re-arm so the next completion re-animates
              }}
              className={`${backHref ? "flex-1" : "w-full"} h-11 rounded-xl bg-navy text-white text-sm font-bold cursor-pointer hover:bg-navy-light active:scale-[0.98] transition-all duration-150`}
            >
              {retakeLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!question) return null;

  // Answer-key source (t_79a92b83): server-graded mode reads correctness from
  // the grading response (gradedResults); client-graded (lesson) mode reads it
  // from the full question payload. The payload in server-graded mode never
  // carries correct_answer_index/explanation.
  const graded = gradedResults[currentQ];
  const answerIndex = serverGraded
    ? graded?.correctAnswerIndex
    : (question as QuizQuestion).correct_answer_index;
  const isCorrect = serverGraded
    ? (graded?.isCorrect ?? false)
    : selected !== null && selected === answerIndex;
  const explanation = serverGraded
    ? graded?.explanation
    : (question as QuizQuestion).explanation;

  // WAI-ARIA radiogroup roving tabindex (APG; R3 follow-up t_42efdd92 F4):
  // only the checked radio is in the tab order (tabIndex=0) — all others are
  // tabIndex=-1, reached via the Arrow keys in handleRadiogroupKeyDown. This
  // replaces the dual-nav (every radio as its own tab stop) with the single
  // Tab entry + arrow-key roving the ARIA radiogroup pattern calls for.
  // Before any selection the first option is the tab stop. (After submission
  // the buttons are disabled, so tabIndex is inert.)
  const radioTabIndex = selected === null ? 0 : selected;

  const segmentsLabel = questions
    .map((_, i) => {
      const attempt = progress.attempts.find((a) => a.questionIndex === i);
      return attempt
        ? `Question ${i + 1} ${attempt.isCorrect ? "correct" : "incorrect"}`
        : `Question ${i + 1} unanswered`;
    })
    .join(". ");

  return (
    <div className="mt-8 max-w-[640px] rounded-[20px] border border-gray-200 bg-white p-7 shadow-sm dark:border-[var(--border-default)] dark:bg-[var(--surface-card)]">
      {/* Kicker */}
      <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-red uppercase tracking-[0.08em] mb-1.5">
        <span className="w-[3px] h-3 rounded-sm bg-red" />
        {kicker}
      </div>

      {/* Progress label + segment bar */}
      <div className="font-mono text-[11.5px] text-gray-500 mb-4">
        Question {currentQ + 1} of {questions.length}
      </div>
      <div
        role="img"
        aria-label={`Quiz progress: ${segmentsLabel}`}
        className="flex gap-[5px] mb-5"
      >
        {questions.map((_, i) => {
          const answered = answeredIndexes.has(i);
          const correct = progress.attempts.find((a) => a.questionIndex === i)?.isCorrect;
          return (
            <div
              key={i}
              title={answered ? (correct ? "Correct" : "Incorrect") : "Unanswered"}
              className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                answered
                  ? correct
                    ? "bg-green-500"
                    : "bg-red dark:bg-[var(--accent)]"
                  : "bg-gray-200 dark:bg-[var(--border-subtle)]"
              }`}
            />
          );
        })}
      </div>

      {/* Segment legend — non-color state cues (WCAG 1.4.1) */}
      {answeredIndexes.size > 0 && (
        <div
          aria-hidden="true"
          className="flex items-center gap-4 -mt-2 mb-5 font-mono text-[10px] font-medium text-gray-500"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border-[1.5px] border-green-500 text-green-700 text-[9px] font-bold leading-none dark:text-green-300">
              ✓
            </span>
            correct
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border-[1.5px] border-red text-red text-[9px] font-bold leading-none">
              ✕
            </span>
            incorrect
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border-[1.5px] border-gray-300 dark:border-[var(--border-strong)]" />
            unanswered
          </span>
        </div>
      )}

      <p className="text-[17px] font-bold text-navy leading-snug mb-[18px]">
        {question.question}
      </p>

      <div
        className="flex flex-col gap-2.5 mb-5"
        role="radiogroup"
        aria-label="Answer options"
        onKeyDown={handleRadiogroupKeyDown}
      >
        {question.options.map((option, i) => {
          const isSelected = selected === i;
          const isCorrectOption = i === answerIndex;
          const showTag = isAnswered && (isCorrectOption || isSelected);

          let borderClass = "border-gray-200 bg-white hover:border-navy/40 hover:bg-navy/[0.02] dark:border-[var(--border-default)] dark:bg-[var(--surface-card)] dark:hover:border-[var(--accent-hover)] dark:hover:bg-[var(--surface-card-soft)]";
          let radioClass = "border-gray-300 dark:border-[var(--border-strong)]";
          let radioFill = "";
          let textClass = "text-gray-700";

          if (isAnswered) {
            if (isCorrectOption) {
              borderClass = "border-green-500 bg-green-50 dark:bg-green-500/15";
              radioClass = "border-green-500 bg-green-500";
              radioFill = "bg-white";
              textClass = "text-green-800 dark:text-green-300";
            } else if (isSelected && !isCorrectOption) {
              borderClass = "border-red bg-[#FDE8EB] dark:bg-red/15";
              radioClass = "border-red bg-red";
              radioFill = "bg-white";
              textClass = "text-red-800 dark:text-red-300";
            } else if (isSelected) {
              borderClass = "border-green-500 bg-white dark:bg-[var(--surface-card)]";
              radioClass = "border-green-500";
              radioFill = "";
              textClass = "text-gray-700";
            }
          } else if (isSelected) {
            borderClass = "border-navy bg-navy/[0.03] dark:border-[var(--accent)] dark:bg-[var(--surface-card-soft)]";
            radioClass = "border-navy dark:border-[var(--accent)]";
            radioFill = "bg-navy";
            textClass = "text-gray-700";
          }

          return (
            <button
              key={i}
              id={`quiz-option-${quizName}-${currentQ}-${i}`}
              role="radio"
              aria-checked={isSelected}
              tabIndex={i === radioTabIndex ? 0 : -1}
              onClick={() => handleSelect(i)}
              disabled={isAnswered}
              className={`w-full min-h-12 flex items-center gap-3 px-4 rounded-[14px] border-[1.5px] text-left text-[14.5px] font-medium transition-all duration-150 cursor-pointer disabled:cursor-not-allowed ${borderClass} ${textClass}`}
            >
              <span
                className={`w-[18px] h-[18px] rounded-full border-2 shrink-0 flex items-center justify-center transition-colors duration-150 ${radioClass}`}
              >
                <span className={`w-2 h-2 rounded-full ${radioFill}`} />
              </span>
              {option}
              {showTag && (
                <span className="ml-auto font-mono text-[10px] font-bold uppercase tracking-wide">
                  {isCorrectOption
                    ? isSelected
                      ? "Correct"
                      : "Correct answer"
                    : "Your answer"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Answer correctness live region (WCAG 4.1.3) */}
      <span role="status" className="sr-only">
        {showExplanation ? (isCorrect ? "Correct answer" : "Incorrect answer") : ""}
      </span>

      {/* Explanation panel */}
      {showExplanation && explanation && (
        <div
          role="status"
          className={`reveal-up rounded-[14px] border p-[18px] mb-5 text-[13px] leading-relaxed ${
            isCorrect
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-300"
              : "border-red/20 bg-red/5 text-gray-600 dark:border-red/40 dark:bg-red/10 dark:text-[var(--ink-body)]"
          }`}
        >
          <div className="font-mono text-[10px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-1.5">
            Why
          </div>
          <p>{explanation}</p>
        </div>
      )}

      {/* Server-grade failure (t_79a92b83): question stays open for retry */}
      {gradeError && (
        <p role="alert" className="mb-4 text-[12.5px] font-medium text-red">
          Couldn&apos;t grade this answer — check your connection and try again.
        </p>
      )}

      <div className="flex gap-2.5">
        {!isAnswered ? (
          <button
            onClick={handleSubmit}
            disabled={selected === null}
            className="flex-[2] h-11 rounded-xl bg-navy text-white text-[13.5px] font-bold cursor-pointer hover:bg-navy-light active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 inline-flex items-center justify-center gap-2"
          >
            {grading ? (
              <>
                <span
                  aria-hidden="true"
                  className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"
                />
                Grading…
              </>
            ) : (
              "Submit answer"
            )}
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="flex-[2] h-11 rounded-xl bg-navy text-white text-[13.5px] font-bold cursor-pointer hover:bg-navy-light active:scale-[0.98] transition-all duration-150"
          >
            {currentQ < questions.length - 1 ? "Next question" : "See results"}
          </button>
        )}
      </div>
    </div>
  );
}
