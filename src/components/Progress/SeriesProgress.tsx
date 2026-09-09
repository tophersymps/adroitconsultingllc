/**
 * SeriesProgress — real per-series completion indicator (client).
 *
 * Merges localStorage lesson-completion flags with the authenticated user's
 * Supabase summary so the hub/series bars reflect ACTUAL progress, not the
 * published lesson count. Mirrors mockup-progress-learn-hub.html's dual rows.
 */
"use client";

import { useMemo } from "react";
import { useProgressSummary } from "@/lib/hooks/useProgressSummary";
import ProgressIndicator from "@/components/Progress/ProgressIndicator";

interface SeriesProgressProps {
  /** Bare lesson slugs in the series (no prefix). */
  lessonSlugs: string[];
  /** Optional label override; defaults to the real "N of M complete" count. */
  label?: string;
  /** Show the percentage readout. */
  showPercent?: boolean;
}

export default function SeriesProgress({
  lessonSlugs,
  label,
  showPercent = true,
}: SeriesProgressProps) {
  const { merge, isLoading } = useProgressSummary([], lessonSlugs);

  const done = useMemo(
    () => lessonSlugs.filter((slug) => merge.lessons.has(slug)).length,
    [lessonSlugs, merge.lessons],
  );

  if (isLoading && done === 0) {
    return (
      <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-[var(--surface-sunken)] animate-pulse" />
    );
  }

  return (
    <ProgressIndicator
      current={done}
      total={lessonSlugs.length}
      label={label ?? `${done} of ${lessonSlugs.length} complete`}
      showPercent={showPercent}
    />
  );
}