import Link from "next/link";
import { LearnLesson } from "@/data/types";

interface LessonNavigationProps {
  /** Full series lesson list (any order — sorted here by lesson number). */
  lessons: LearnLesson[];
  /** Current lesson slug. */
  currentSlug: string;
}

/**
 * Prev/next within the same series, ordered by authored sequence
 * (lesson number), mirroring PostNavigation visuals (ADR-005).
 *
 * a11y (R3 follow-up t_42efdd92 F6): surface/border/ink utilities are
 * tokenized (--surface-card-soft, --border-default/strong, --ink-muted,
 * --ink-primary, --accent) so the nav fully restyles in dark mode — the
 * global html.dark remap covers text classes and bg-navy but NOT bg-white
 * or border-gray-* (a white hover card in dark mode was the gap).
 */
export default function LessonNavigation({
  lessons,
  currentSlug,
}: LessonNavigationProps) {
  const ordered = [...lessons].sort((a, b) => a.lesson - b.lesson);
  const idx = ordered.findIndex((l) => l.slug === currentSlug);
  const prev = idx > 0 ? ordered[idx - 1] : undefined;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : undefined;

  return (
    <div className="max-w-[720px] mx-auto px-6 py-8 grid grid-cols-2 gap-4">
      {prev ? (
        <Link
          href={`/learn/${prev.series}/${prev.slug}`}
          className="group p-5 border border-[var(--border-default)] rounded-xl hover:border-[var(--border-strong)] hover:bg-[var(--surface-card-soft)] hover:shadow-md hover:shadow-navy/5 hover:-translate-y-0.5 transition-all duration-200 no-underline"
        >
          <div className="flex items-center gap-1 font-mono text-[10.5px] text-[var(--ink-muted)] uppercase tracking-[0.06em] font-bold mb-2 transition-colors duration-150 group-hover:text-[var(--accent)]">
            <span className="transition-transform duration-200 group-hover:-translate-x-0.5">
              &larr;
            </span>
            Lesson {prev.lesson}
          </div>
          <h4 className="text-sm font-semibold text-[var(--ink-primary)] leading-snug transition-colors duration-150 group-hover:text-[var(--accent)]">
            {prev.title}
          </h4>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/learn/${next.series}/${next.slug}`}
          className="group p-5 border border-[var(--border-default)] rounded-xl hover:border-[var(--border-strong)] hover:bg-[var(--surface-card-soft)] hover:shadow-md hover:shadow-navy/5 hover:-translate-y-0.5 transition-all duration-200 no-underline text-right"
        >
          <div className="flex items-center justify-end gap-1 font-mono text-[10.5px] text-[var(--ink-muted)] uppercase tracking-[0.06em] font-bold mb-2 transition-colors duration-150 group-hover:text-[var(--accent)]">
            Lesson {next.lesson}
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">
              &rarr;
            </span>
          </div>
          <h4 className="text-sm font-semibold text-[var(--ink-primary)] leading-snug transition-colors duration-150 group-hover:text-[var(--accent)]">
            {next.title}
          </h4>
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
