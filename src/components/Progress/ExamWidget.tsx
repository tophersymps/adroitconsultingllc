/**
 * ExamWidget — timed cert prep exam (copy deck §4, mockup-exam.html).
 *
 * Differs from QuizWidget:
 *  - NO per-question feedback during the run (no correct/wrong styling, no
 *    "Why" panel, no explanations).
 *  - Flag-for-review, 60-segment navigator, "{n} answered" counter.
 *  - 105:00 deadline countdown (deadline-based, drift-proof under tab
 *    throttling), AUTO-SUBMIT at 00:00 (interval + visibilitychange).
 *  - Submit → POST /api/progress/quiz/batch → results: score ring, pass/fail
 *    verdict (≥72%), answer review with flagged items, Retake + Back.
 *
 * Timer trust (ADR-103): client countdown + server-side elapsed bound
 * [0, 105*60 + 60]. prefers-reduced-motion is CSS-driven (pulse classes are
 * transitions/animations neutralised by the global reduced-motion block).
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  ExamAnswer,
  ExamResultItem,
  ExamSubmitResult,
  QuizQuestion,
} from "@/shared/contracts";
import { trackExamComplete } from "@/lib/analytics";

const EXAM_MINUTES = 105;
const EXAM_SECONDS = EXAM_MINUTES * 60;

/**
 * Question shape shipped to the client — deliberately stripped of the answer
 * key (correct_answer_index, explanation) server-side (security t_7469e31d
 * F3 / CWE-200). The widget only needs the prompt and options; grading and
 * per-question results come from POST /api/progress/quiz/batch.
 */
export type ExamClientQuestion = Pick<QuizQuestion, "question" | "options">;

interface ExamWidgetProps {
  quizName: string;
  questions: ExamClientQuestion[];
  /** Series slug — back link target. */
  seriesSlug: string;
  /** Series display name (for the header sub). */
  seriesName: string;
}

type Phase = "run" | "submitting" | "results";

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ExamWidget({
  quizName,
  questions,
  seriesSlug,
  seriesName,
}: ExamWidgetProps) {
  const total = questions.length;
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [phase, setPhase] = useState<Phase>("run");
  const [result, setResult] = useState<ExamSubmitResult | null>(null);
  const [submitError, setSubmitError] = useState(false);

  // Deadline-based countdown (drift-proof under throttling): startedAt is set
  // once on mount; the remaining value is always deadline − now.
  const startedAtRef = useRef<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(EXAM_SECONDS);
  const submittedRef = useRef(false);
  // Mirror answers into a ref so the countdown/submit callbacks always read
  // the latest answers without stale closures. Synced in an effect (never
  // during render — react-hooks/refs).
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const answeredCount = Object.keys(answers).length;
  const resultById = useResultMap(result?.results);

  // a11y (audit finding 1): the results view gets a real heading and focus
  // moves to it on render/submit/auto-submit so AT users hear the outcome.
  const resultsHeadingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (phase === "results" && result) {
      resultsHeadingRef.current?.focus();
    }
  }, [phase, result]);

  // a11y (audit finding 2): polite live region announces the countdown at
  // meaningful thresholds (10/5/1 min) and the auto-submit — NOT every
  // second (that would be noise). Thresholds are announced once per run.
  const [timerAnnouncement, setTimerAnnouncement] = useState<string | null>(null);
  const announcedThresholdsRef = useRef<Set<number>>(new Set());

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setPhase("submitting");
    setSubmitError(false);

    const startedAt = startedAtRef.current ?? Date.now();
    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - startedAt) / 1000),
    );
    const answerList: ExamAnswer[] = Object.entries(answersRef.current).map(
      ([qi, ai]) => ({ questionIndex: Number(qi), userAnswerIndex: ai }),
    );

    try {
      const res = await fetch("/api/progress/quiz/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizName, elapsedSeconds, answers: answerList }),
      });
      if (!res.ok) throw new Error(`batch submit ${res.status}`);
      const data = (await res.json()) as ExamSubmitResult;
      // Progress-funnel analytics (B-06): exam → certificate. Pass verdict is
      // derived from the server response score (>=72% per exam page header).
      trackExamComplete({ quizName, score: data.score ?? 0, passed: (data.score ?? 0) >= 72 });
      // Double-submit guard: ignore duplicate responses (client disables the
      // button while in flight, but a stray response must not clobber state).
      if (submittedRef.current && phase !== "results") {
        setResult(data);
        setPhase("results");
      }
    } catch {
      submittedRef.current = false; // allow retry
      setPhase("run");
      setSubmitError(true);
    }
  }, [quizName, phase]);

  // Countdown + auto-submit at zero.
  useEffect(() => {
    if (phase !== "run") return;
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
    const deadline = startedAtRef.current + EXAM_SECONDS * 1000;

    const tick = () => {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setTimeLeft(remaining);

      // a11y (finding 2): announce once at each threshold (10/5/1 min) and on
      // auto-submit. Thresholds announce one time per run (ref set), so the
      // live region doesn't chatter every second.
      if (remaining > 0) {
        const announceAt = [
          { at: 10 * 60, msg: "10 minutes remaining" },
          { at: 5 * 60, msg: "5 minutes remaining" },
          { at: 60, msg: "1 minute remaining" },
        ].find((t) => remaining <= t.at && !announcedThresholdsRef.current.has(t.at));
        if (announceAt) {
          announcedThresholdsRef.current.add(announceAt.at);
          setTimerAnnouncement(announceAt.msg);
        }
      }

      if (remaining <= 0) {
        if (!announcedThresholdsRef.current.has(0)) {
          announcedThresholdsRef.current.add(0);
          setTimerAnnouncement("Time's up — your exam was submitted automatically.");
        }
        submit();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);

    // Tab-away: if the tab was backgrounded, the deadline still fires on
    // return via visibilitychange (browsers throttle intervals in bg tabs).
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase, submit]);

  const timeWarn = timeLeft < 2 * 60;
  const timeUrgent = timeLeft < 10 * 60;

  function selectOption(optionIndex: number) {
    if (phase !== "run") return;
    setAnswers((prev) => ({ ...prev, [currentQ]: optionIndex }));
  }

  function toggleFlag() {
    if (phase !== "run") return;
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(currentQ)) next.delete(currentQ);
      else next.add(currentQ);
      return next;
    });
  }

  // a11y (finding 5): WAI-ARIA radiogroup arrow-key roving — ArrowDown/Right
  // move to the next option, ArrowUp/Left to the previous, wrapping around.
  // The focused option becomes the selection (automatic-activation pattern),
  // matching QuizWidget's handleRadiogroupKeyDown.
  function handleRadiogroupKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const dir =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (dir === 0) return;
    event.preventDefault();
    const optionCount = questions[currentQ]!.options.length;
    const start = answers[currentQ] === undefined ? -1 : answers[currentQ]!;
    const next = (start + dir + optionCount) % optionCount;
    selectOption(next);
    document
      .getElementById(`exam-option-${quizName}-${currentQ}-${next}`)
      ?.focus();
  }

  function handleNext() {
    if (phase !== "run") return;
    if (currentQ < total - 1) setCurrentQ(currentQ + 1);
    else submit();
  }

  function handleRetake() {
    setCurrentQ(0);
    setAnswers({});
    setFlagged(new Set());
    setResult(null);
    setSubmitError(false);
    submittedRef.current = false;
    startedAtRef.current = null;
    setTimeLeft(EXAM_SECONDS);
    announcedThresholdsRef.current = new Set();
    setTimerAnnouncement(null);
    setPhase("run");
  }

  // ------------------------- Results screen -------------------------
  if (phase === "results" && result) {
    const pass = result.passed;
    return (
      <div className="max-w-[720px] mx-auto px-6 pt-8 pb-24">
        {/* a11y (finding 1): heading + focus target for the results view */}
        <h2 ref={resultsHeadingRef} tabIndex={-1} className="sr-only">Exam results</h2>
        <div className="rounded-[20px] border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="font-mono text-[11px] font-bold text-navy uppercase tracking-[0.09em] mb-4">
            Cert Prep Exam · Results
          </div>

          {/* Score ring */}
          <div className="relative w-40 h-40 mx-auto mb-5">
            <svg viewBox="0 0 168 168" className="w-full h-full -rotate-90" role="img" aria-label={`${result.score}% — ${result.correct} of ${result.total} correct`}>
              <circle cx="84" cy="84" r="72" fill="none" stroke="var(--color-gray-200, #E5E7EB)" strokeWidth="12" />
              <circle
                cx="84" cy="84" r="72" fill="none"
                stroke={pass ? "var(--signal-done)" : "var(--color-red, #C8102E)"}
                strokeWidth="12" strokeLinecap="round"
                strokeDasharray={`${(result.score / 100) * 452.4} 452.4`}
                className="transition-[stroke-dasharray] duration-[450ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-[2.15rem] font-extrabold text-navy leading-none tabular-nums">
                {result.score}%
              </span>
              <span className="text-[11px] text-gray-500 font-bold uppercase tracking-[0.08em] mt-1">
                {result.correct}/{result.total}
              </span>
            </div>
          </div>

          {/* Verdict */}
          <div
            className={`inline-flex items-center gap-2 font-mono text-[13px] font-bold px-4 py-2 rounded-full mb-4 ${
              pass ? "bg-emerald/10 text-emerald-800" : "bg-[#FDE8EB] text-red-dark"
            }`}
          >
            {pass ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
            {pass ? "Passed · 72% required" : "Not passed · 72% required"}
          </div>

          <p className="text-[13px] text-gray-500 mb-6">
            Best score tracked · retakes unlimited
          </p>

          {/* Answer review */}
          <div className="text-left">
            <div className="flex items-center justify-between font-mono text-[10.5px] font-bold text-gray-500 uppercase tracking-[0.09em] py-2 border-t border-gray-100">
              <span>Answer review</span>
              <span>{result.total} items</span>
            </div>
            <div className="max-h-[260px] overflow-y-auto border-b border-gray-100">
              {questions.map((q, i) => {
                const item = resultById.get(i);
                const isCorrect = item?.isCorrect ?? false;
                const isFlagged = flagged.has(i);
                return (
                  <div key={i} className="flex items-start gap-2.5 py-2 border-b border-gray-100 text-[12.5px] last:border-0">
                    <svg
                      aria-hidden="true"
                      className="w-4 h-4 mt-0.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={isCorrect ? "var(--signal-done)" : "var(--color-red, #C8102E)"}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {isCorrect ? (
                        <polyline points="20 6 9 17 4 12" />
                      ) : (
                        <>
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </>
                      )}
                    </svg>
                    <span className="text-gray-600 leading-relaxed flex-1">
                      Q{i + 1} — {q.question}
                    </span>
                    {isFlagged && (
                      <span className="font-mono text-[9.5px] font-bold text-red uppercase tracking-[0.04em] whitespace-nowrap">
                        flagged
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2.5 mt-6">
            <button
              onClick={handleRetake}
              className="flex-1 h-11 rounded-xl border-[1.5px] border-gray-200 bg-white text-gray-600 text-[13.5px] font-bold cursor-pointer hover:border-navy hover:text-navy active:scale-[0.98] transition-all duration-150"
            >
              Retake exam
            </button>
            <Link
              href={`/learn/${seriesSlug}`}
              className="flex-1 h-11 rounded-xl bg-navy text-white text-[13.5px] font-bold no-underline flex items-center justify-center cursor-pointer hover:bg-navy-light active:scale-[0.98] transition-all duration-150"
            >
              Back to series
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------- Sticky timer bar -------------------------
  // WAI-ARIA radiogroup roving tabindex (APG; R3 follow-up t_42efdd92 F4):
  // only the checked option is in the tab order; the rest are reached with the
  // Arrow keys (handleRadiogroupKeyDown). Before any selection the first
  // option is the tab stop.
  const radioTabIndex = answers[currentQ] === undefined ? 0 : answers[currentQ]!;
  return (
    <>
      {/* a11y (finding 2): polite live region for threshold announcements.
          The visible countdown carries role="timer" with aria-live="off"
          (per-second ticks are not announced; thresholds are, once each). */}
      <span className="sr-only" role="status" aria-live="polite">
        {timerAnnouncement}
      </span>
      <div className="sticky top-0 z-30 bg-navy text-white shadow-lg">
        <div className="max-w-[760px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <span aria-hidden="true" className="w-2 h-2 rounded-full bg-red-light" />
            <span className="font-mono text-[12px] font-bold tracking-[0.04em] truncate">
              Cert Prep Exam
              <span className="text-white/70"> · {total} questions</span>
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/70 hidden sm:inline">
              Time remaining
            </span>
            <span
              role="timer"
              aria-live="off"
              className={`font-mono text-[1.3rem] font-bold tabular-nums ${
                timeUrgent ? "text-red-light" : timeWarn ? "text-[#FF6B7D]" : ""
              } ${timeUrgent || timeWarn ? "animate-pulse" : ""}`}
            >
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>
        <div className="max-w-[760px] mx-auto px-6 pb-2.5 flex items-center justify-between">
          <span className="font-mono text-[10px] text-white/70">Auto-submits at 00:00</span>
          <span className="font-mono text-[10px] text-white/70">
            {formatTime(timeLeft)} remaining · answered {answeredCount}/{total}
          </span>
        </div>
      </div>

      <div className="max-w-[760px] mx-auto px-6 pt-8 pb-24">
        {/* Exam header */}
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-navy uppercase tracking-[0.09em] mb-1">
              <span className="w-[3px] h-3 rounded-sm bg-navy" />
              Cert Prep Exam · {seriesName}
            </div>
            <h1 className="text-[clamp(1.5rem,3vw,1.9rem)] font-extrabold text-navy tracking-[-0.02em] leading-tight">
              Certification Prep Exam
            </h1>
          </div>
          <div className="font-mono text-[11px] text-gray-500 text-right">
            <b className="text-navy">{total} questions</b>
            <br />
            105 minutes · no feedback
            <br />
            pass ≥ 72%
          </div>
        </div>

        {/* Progress label + 60 segments (no correctness color) */}
        <div className="flex items-center justify-between font-mono text-[11.5px] text-gray-500 mb-2">
          <span>Question {currentQ + 1} of {total}</span>
          <span className="text-navy font-bold">{answeredCount} answered</span>
        </div>
        <div className="flex gap-[1.5px] sm:gap-[2.5px] mb-7" role="img" aria-label={`${answeredCount} of ${total} answered`}>
          {questions.map((_, i) => (
            <div
              key={i}
              className={`h-[3.5px] flex-1 min-w-0 sm:min-w-[6px] rounded-full transition-colors duration-200 ${
                answers[i] !== undefined ? "bg-navy" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* Exam card */}
        <div className="rounded-[20px] border border-gray-200 bg-white p-7 shadow-sm">
          <div className="font-mono text-[10.5px] font-bold text-gray-500 uppercase tracking-[0.09em] mb-2">
            Question {currentQ + 1} of {total}
          </div>
          <p className="text-[1.05rem] font-bold text-navy leading-[1.45] mb-5">
            {questions[currentQ]!.question}
          </p>

          <div className="flex flex-col gap-2.5 mb-6" role="radiogroup" aria-label="Answer options" onKeyDown={handleRadiogroupKeyDown}>
            {questions[currentQ]!.options.map((option, i) => {
              const isSelected = answers[currentQ] === i;
              return (
                <button
                  key={i}
                  id={`exam-option-${quizName}-${currentQ}-${i}`}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={i === radioTabIndex ? 0 : -1}
                  onClick={() => selectOption(i)}
                  className={`w-full min-h-12 flex items-center gap-3 px-4 rounded-[14px] border-[1.5px] text-left text-[14.5px] font-medium transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? "border-navy bg-navy/[0.03]"
                      : "border-gray-200 bg-white hover:border-navy/40 hover:bg-navy/[0.02]"
                  } text-gray-700`}
                >
                  <span
                    className={`w-[18px] h-[18px] rounded-full border-2 shrink-0 flex items-center justify-center transition-colors duration-150 ${
                      isSelected ? "border-navy" : "border-gray-300"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${isSelected ? "bg-navy" : ""}`} />
                  </span>
                  {option}
                </button>
              );
            })}
          </div>

          {/* a11y (R3 follow-up t_42efdd92 F5): flag + next/submit are one
              action cluster — grouped so AT announces them together. */}
          <div role="group" aria-label="Exam actions" className="flex gap-2.5">
            <button
              onClick={toggleFlag}
              aria-pressed={flagged.has(currentQ)}
              className={`h-11 px-4 rounded-xl border-[1.5px] text-[13px] font-bold cursor-pointer transition-all duration-150 inline-flex items-center gap-2 ${
                flagged.has(currentQ)
                  ? "border-red bg-[#FDE8EB] text-red"
                  : "border-gray-200 bg-white text-gray-500 hover:border-navy hover:text-navy"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              {flagged.has(currentQ) ? "Flagged" : "Flag for review"}
            </button>
            <button
              onClick={handleNext}
              disabled={phase === "submitting"}
              className="flex-1 h-11 rounded-xl bg-navy text-white text-[13.5px] font-bold cursor-pointer hover:bg-navy-light active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {phase === "submitting"
                ? "Submitting…"
                : currentQ < total - 1
                  ? "Next question"
                  : "Submit exam"}
            </button>
          </div>

          <div className="flex items-center gap-2 font-mono text-[10.5px] text-gray-500 mt-4">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            Exam mode — no correct/wrong feedback during the run. Answers are reviewed on the results screen.
          </div>

          {submitError && (
            <p role="alert" className="mt-4 text-[12.5px] font-semibold text-red">
              Submit failed — check your connection and try again.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/** Map questionIndex → ExamResultItem for O(1) review lookup. */
function useResultMap(results: ExamResultItem[] | undefined): Map<number, ExamResultItem> {
  return useMemo(() => {
    const map = new Map<number, ExamResultItem>();
    for (const r of results ?? []) map.set(r.questionIndex, r);
    return map;
  }, [results]);
}
