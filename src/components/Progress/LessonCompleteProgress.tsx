/**
 * LessonCompleteProgress — real completion-state indicator for lesson pages.
 *
 * Uses useLessonProgress (adroit-blog:lesson:<slug> + lesson_completion table)
 * so the bar reflects the actual completion state, not a hard-coded count.
 */
"use client";

import { useLessonProgress } from "@/lib/hooks/useLessonProgress";
import ProgressIndicator from "@/components/Progress/ProgressIndicator";

interface LessonCompleteProgressProps {
  lessonSlug: string;
  /** Label when the lesson is not yet complete. */
  uncompleteLabel?: string;
}

export default function LessonCompleteProgress({
  lessonSlug,
  uncompleteLabel = "Not complete yet",
}: LessonCompleteProgressProps) {
  const { isCompleted, isLoading } = useLessonProgress(lessonSlug);

  if (isLoading) {
    return (
      <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-[var(--surface-sunken)] animate-pulse" />
    );
  }

  return (
    <ProgressIndicator
      current={isCompleted ? 1 : 0}
      total={1}
      label={isCompleted ? "Complete" : uncompleteLabel}
      showPercent={false}
    />
  );
}
