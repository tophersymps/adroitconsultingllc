import Link from "next/link";
import { LearnLesson } from "@/data/types";

interface LessonCardProps {
  lesson: LearnLesson;
  totalLessons: number;
  /** Marks the newest lesson in the series (first row). */
  isNewest?: boolean;
}

/** Syllabus row (mockup: learn-series.html) — mono sequence badge + meta. */
export default function LessonCard({
  lesson,
  totalLessons,
  isNewest = false,
}: LessonCardProps) {
  return (
    <Link
      href={`/learn/${lesson.series}/${lesson.slug}`}
      className="group flex items-center gap-[18px] px-3 py-[18px] border-b border-gray-200 dark:border-[var(--border-default)] rounded-lg transition-[background-color,transform] duration-150 no-underline hover:bg-gray-50 dark:hover:bg-[var(--surface-card-soft)] hover:translate-x-1"
    >
      {/* Sequence badge */}
      <div
        className="flex-shrink-0 w-14 h-10 rounded-xl bg-navy flex flex-col items-center justify-center font-mono transition-colors duration-150 group-hover:bg-red"
        aria-label={`Lesson ${lesson.lesson} of ${totalLessons}`}
      >
        <span className="text-[15px] font-bold leading-none text-red group-hover:text-white">
          {lesson.lesson}
        </span>
        <span className="text-[7.5px] uppercase tracking-[0.06em] text-white/55 mt-0.5">
          Lesson
        </span>
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <h3 className="text-[15px] font-semibold text-gray-800 dark:text-[var(--ink-body)] leading-snug truncate transition-colors duration-150 group-hover:text-red">
          {lesson.title}
        </h3>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-[var(--ink-muted)] mt-1">
          <span>{lesson.date}</span>
          <span className="w-[3px] h-[3px] rounded-full bg-gray-300 dark:bg-[var(--border-default)]" />
          <span>{lesson.readTime}</span>
        </div>
      </div>

      {isNewest && (
        <span className="flex-shrink-0 text-[10px] font-bold text-red bg-red/8 px-2 py-0.5 rounded-full uppercase tracking-[0.05em]">
          New
        </span>
      )}
      <span className="flex-shrink-0 text-gray-500 dark:text-[var(--ink-muted)] text-sm transition-all duration-200 group-hover:text-red group-hover:translate-x-0.5">
        &rarr;
      </span>
    </Link>
  );
}
