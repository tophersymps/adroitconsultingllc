interface LessonProgressProps {
  published: number;
  total: number;
  /** Light variant for use on gradient strips (white fill/counter). */
  onGradient?: boolean;
}

/**
 * Signature Learn component (ADR-004): red progress fill on gray track +
 * mono "{N} lessons · published" counter. Progress = lessons present vs
 * highest lesson number — a content metric, NOT user completion tracking.
 * (B-01: "N of M complete" belongs to SeriesProgress, not this label.)
 */
export default function LessonProgress({
  published,
  total,
  onGradient = false,
}: LessonProgressProps) {
  const pct = total > 0 ? Math.min(100, (published / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, total)}
        aria-valuenow={Math.min(published, total)}
        aria-valuetext={`${published} of ${total} lessons published`}
        aria-label={`Lesson progress: ${published} of ${total}`}
        className={`flex-1 h-1.5 rounded-full overflow-hidden ${
          onGradient ? "bg-white/25" : "bg-gray-200"
        }`}
      >
        <div
          className={`h-full rounded-full ${
            onGradient ? "bg-white" : "bg-red"
          } transition-[width] duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`font-mono text-[11.5px] font-semibold tracking-[0.01em] tabular-nums whitespace-nowrap ${
          onGradient ? "text-white" : "text-gray-500"
        }`}
      >
        <b className={onGradient ? "text-white font-bold" : "text-navy font-bold"}>{published}</b>{" "}
        lesson{published === 1 ? "" : "s"} · published
      </span>
    </div>
  );
}
