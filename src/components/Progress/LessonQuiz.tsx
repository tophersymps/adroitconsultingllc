/**
 * LessonQuiz — the "Practice Questions" section embed on lesson pages.
 *
 * Copy deck §1 (kara): section rule + mono header above the card:
 *   kicker "Practice Questions" · meta "3 QUESTIONS · ~2 MIN"
 *   title "Check your understanding" · note (tracking copy)
 * The card itself is QuizWidget with kicker "Quiz · Lesson {N}".
 *
 * Rendered ONLY for authed users (the lesson page server component gates);
 * guests get GuestCTA instead. When a lesson has no questions file the
 * server component renders nothing at all (copy deck §1 "render nothing").
 */
"use client";

import QuizWidget from "@/components/Progress/QuizWidget";
import { useLessonProgress } from "@/lib/hooks/useLessonProgress";
import type { QuizQuestion } from "@/shared/contracts";

interface LessonQuizProps {
  quizName: string;
  lessonNumber: number;
  /** Canonical lesson slug — used to auto-mark the lesson complete on a perfect score. */
  lessonSlug: string;
  questions: QuizQuestion[];
  /** Back link target (lesson page itself). */
  backHref: string;
}

export default function LessonQuiz({
  quizName,
  lessonNumber,
  lessonSlug,
  questions,
  backHref,
}: LessonQuizProps) {
  const { isCompleted, markComplete } = useLessonProgress(lessonSlug);

  // Auto-complete the lesson when the practice quiz is answered perfectly.
  // Guards against re-marking: if the lesson is already complete the hook
  // would toggle back off, so we no-op here (the write is an idempotent
  // upsert, and MarkComplete visibility is driven by the same hook).
  const handlePerfectScore = () => {
    if (isCompleted) return;
    markComplete();
  };

  return (
    <section aria-label="Practice questions" className="mt-11 border-t border-gray-200 pt-7 dark:border-[var(--border-default)]">
      <div className="max-w-[640px]">
        {/* Section rule + mono header */}
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-red uppercase tracking-[0.08em] mb-1.5">
          <span className="w-[3px] h-3 rounded-sm bg-red" />
          Practice Questions
        </div>
        <div className="font-mono text-[10.5px] text-gray-500 tracking-[0.04em] mb-2">
          3 QUESTIONS · ~2 MIN
        </div>
        <h2 className="text-[1.35rem] font-extrabold text-navy tracking-[-0.02em] mb-1.5">
          Check your understanding
        </h2>
        <p className="text-[13px] text-gray-500 mb-2">
          Answer all three to lock in this lesson. Your best score is tracked and counts toward your certification readiness.
        </p>
      </div>

      <QuizWidget
        quizName={quizName}
        questions={questions}
        kicker={`Quiz · Lesson ${lessonNumber}`}
        retakeLabel="Retake quiz"
        backHref={backHref}
        backLabel="Back to lesson"
        onPerfectScore={handlePerfectScore}
      />
    </section>
  );
}
