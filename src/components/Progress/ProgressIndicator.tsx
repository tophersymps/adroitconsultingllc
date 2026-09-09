/**
 * ProgressIndicator — reusable progress bar with label.
 *
 * Uses existing design tokens: red fill on gray track, mono counter.
 */
interface ProgressIndicatorProps {
  current: number;
  total: number;
  /** Label text to display (e.g. "Lesson 3 of 10"). */
  label?: string;
  /** Show percentage. */
  showPercent?: boolean;
}

export default function ProgressIndicator({
  current,
  total,
  label,
  showPercent = false,
}: ProgressIndicatorProps) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[11px] font-semibold text-gray-500 dark:text-[var(--ink-muted)]">
          {label || `Progress`}
        </span>
        {showPercent && (
          <span className="font-mono text-[11px] font-bold text-navy dark:text-[var(--ink-primary)] tabular-nums">
            {pct}%
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, total)}
        aria-valuenow={Math.min(current, total)}
        aria-valuetext={pct > 0 ? `${pct}%` : `${current} of ${total}`}
        aria-label={label || "Progress"}
        className="h-1.5 rounded-full overflow-hidden bg-gray-200 dark:bg-[var(--border-default)]"
      >
        <div
          className="h-full rounded-full bg-red dark:bg-[var(--accent)] transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
