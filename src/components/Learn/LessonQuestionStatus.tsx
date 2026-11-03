/**
 * LessonQuestionStatus - the in-lesson practice question pill on a syllabus
 * lesson card ("3/3 questions answered", "1/3 questions answered",
 * "3 practice questions").
 *
 * Reads the same localStorage record the lesson page's QuizWidget writes
 * (`useQuizProgress(quizName)`, ADR-004), so answering a question inside a
 * lesson is reflected on the syllabus the next time it renders.
 *
 * Hydration (QA F-1): until the stored state is read after mount the pill
 * shows the neutral "N practice questions" form, which is also exactly what
 * the server renders, so first paint never mismatches.
 */
"use client";

import { useQuizProgress } from "@/lib/hooks/useQuizProgress";

export type QuestionState = "done" | "partial" | "none";

export interface QuestionStatus {
  state: QuestionState;
  answered: number;
  total: number;
  /** Best completed-run score (0-100) once a full run exists. */
  bestScore?: number;
}

/**
 * Pure status derivation (unit-tested). A completed run (`attemptCount > 0`)
 * counts as fully answered even after a retake cleared the per-question
 * attempts, so the pill never regresses from "done" to "0/3".
 */
export function deriveQuestionStatus(
  progress: { attempts: { questionIndex: number }[]; bestScore: number; attemptCount: number },
  total: number,
  hydrated: boolean,
): QuestionStatus {
  if (!hydrated || total <= 0) return { state: "none", answered: 0, total };
  if (progress.attemptCount > 0) {
    return { state: "done", answered: total, total, bestScore: progress.bestScore };
  }
  const answered = Math.min(total, new Set(progress.attempts.map((a) => a.questionIndex)).size);
  if (answered >= total) return { state: "done", answered: total, total };
  if (answered > 0) return { state: "partial", answered, total };
  return { state: "none", answered: 0, total };
}

const PILL_BASE =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold leading-none whitespace-nowrap";

const PILL_TONE: Record<QuestionState, string> = {
  done: "bg-[var(--signal-done-bg)] text-[var(--signal-done)]",
  partial: "bg-[var(--color-amber-light)] text-[var(--color-amber-800)] dark:bg-[rgba(245,158,11,0.14)] dark:text-[var(--signal-warn)]",
  none: "bg-[var(--surface-sunken)] text-[var(--ink-muted)]",
};

interface LessonQuestionStatusProps {
  /** Lesson quiz storage key, `<series>:lesson:<slug>` (from the quiz JSON). */
  quizName: string;
  /** Number of practice questions in the lesson quiz. */
  total: number;
}

export default function LessonQuestionStatus({ quizName, total }: LessonQuestionStatusProps) {
  const { progress, hydrated } = useQuizProgress(quizName, total);
  const status = deriveQuestionStatus(progress, total, hydrated);
  const noun = total === 1 ? "question" : "questions";

  let icon: string;
  let text: string;
  if (status.state === "done") {
    icon = "\u2713";
    text = `${total}/${total} ${noun} answered`;
  } else if (status.state === "partial") {
    icon = "\u25B6";
    text = `${status.answered}/${total} ${noun} answered`;
  } else {
    icon = "\u25CB";
    text = `${total} practice ${noun}`;
  }

  return (
    <span
      className={`${PILL_BASE} ${PILL_TONE[status.state]}`}
      data-testid="lesson-question-status"
      data-state={status.state}
    >
      <span aria-hidden="true">{icon}</span>
      {text}
    </span>
  );
}
