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

  // PERF-M2 (t_c54f6999): the loading state renders the FULL ProgressIndicator
  // at 0%, not a bare 6px pulse bar. The prerendered HTML (loading on first
  // paint) and the hydrated render are then the same height, so the strip
  // cannot grow the card after hydration and shift the rows below it.
  if (isLoading && done === 0) {
    return (
      <div aria-hidden className="animate-pulse opacity-70">
        <ProgressIndicator
          current={0}
          total={lessonSlugs.length}
          label={`0 of ${lessonSlugs.length} complete`}
          showPercent={showPercent}
        />
      </div>
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