/**
 * MarkComplete — circular check toggle for marking a lesson complete.
 *
 * Uses useLessonProgress hook (adroit-blog:lesson:<slug> + Supabase sync),
 * matching design/mockup-progress-series-lessons.html's 48px toggle.
 */
"use client";

import { useLessonProgress } from "@/lib/hooks/useLessonProgress";

interface MarkCompleteProps {
  lessonSlug: string;
  /** Accessible label prefix (defaults to the slug). */
  label?: string;
}

export default function MarkComplete({ lessonSlug, label }: MarkCompleteProps) {
  const { isCompleted, markComplete, isLoading } = useLessonProgress(lessonSlug);

  return (
    <button
      onClick={markComplete}
      disabled={isLoading}
      aria-pressed={isCompleted}
      aria-label={`${isCompleted ? "Unmark" : "Mark"} ${label ?? lessonSlug} ${
        isCompleted ? "incomplete" : "complete"
      }`}
      className={`flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-wait active:scale-[0.98] ${
        isCompleted
          ? "check-pop border-green-500 bg-green-500 text-white"
          : "border-gray-400 bg-white text-transparent hover:border-green-500 dark:bg-[var(--surface-card)] dark:border-[var(--border-strong)] dark:hover:border-green-500"
      }`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </button>
  );
}
