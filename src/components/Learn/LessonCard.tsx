import Link from "next/link";
import type { ReactNode } from "react";
import { LearnLesson } from "@/data/types";
import LessonQuestionStatus from "@/components/Learn/LessonQuestionStatus";

/** Where the learner stands on this lesson (drives the node + card accent). */
export type LessonCardState = "completed" | "active" | "upcoming";

export interface LessonQuizMeta {
  /** localStorage / API quiz key, `<series>:lesson:<slug>`. */
  quizName: string;
  /** Number of practice questions in the lesson. */
  total: number;
}

interface LessonCardProps {
  lesson: LearnLesson;
  totalLessons: number;
  /** Progress state; `upcoming` (neutral) when omitted. */
  state?: LessonCardState;
  /** In-lesson practice quiz, when the lesson ships one. */
  quiz?: LessonQuizMeta | null;
  /** Marks the newest lesson in the series. */
  isNewest?: boolean;
  /**
   * Interactive controls for the card footer (the MarkComplete toggle). They
   * sit above the stretched title link so they stay independently clickable.
   */
  actions?: ReactNode;
}

const BADGE_TONE: Record<LessonCardState, string> = {
  completed: "bg-navy text-white dark:bg-[var(--surface-inverse)]",
  active: "bg-[var(--accent-bg)] text-white",
  upcoming:
    "bg-transparent border border-[var(--border-strong)] text-[var(--ink-muted)]",
};

const CTA_COPY: Record<LessonCardState, string> = {
  completed: "Review",
  active: "Continue lesson",
  upcoming: "Start lesson",
};

const CTA_TONE: Record<LessonCardState, string> = {
  completed: "text-[var(--ink-muted)]",
  active: "bg-[var(--accent-bg)] text-white px-3 py-1.5 rounded-lg shadow-sm",
  upcoming:
    "border border-[var(--border-strong)] text-[var(--ink-primary)] px-3 py-1.5 rounded-lg",
};

/**
 * Syllabus lesson card (unified syllabus timeline). Number badge, title,
 * read time, a two-line brief from the lesson excerpt, and a footer with the
 * practice-question status and the completion toggle.
 *
 * The title is the card's only link; its `::after` stretches over the whole
 * card so the card is one click target, while the footer controls are lifted
 * above it with `relative z-10`. One link per lesson keeps the syllabus link
 * order (lessons and checks) exactly as screen readers and tests expect.
 */
export default function LessonCard({
  lesson,
  totalLessons,
  state = "upcoming",
  quiz = null,
  isNewest = false,
  actions,
}: LessonCardProps) {
  const isActive = state === "active";
  return (
    <article
      data-state={state}
      className={`group relative rounded-xl border bg-[var(--surface-card)] shadow-[var(--shadow-card)] transition-[background-color,transform] duration-150 hover:translate-x-1 hover:bg-[var(--surface-card-soft)] ${
        isActive
          ? "border-[var(--accent)] border-l-[3px]"
          : "border-[var(--border-default)]"
      }`}
    >
      <div className="flex gap-4 p-4 sm:px-5">
        {/* Sequence badge */}
        <div
          aria-hidden="true"
          className={`flex-shrink-0 w-12 h-11 sm:w-14 rounded-lg flex flex-col items-center justify-center font-mono ${BADGE_TONE[state]}`}
        >
          <span className="text-[15px] font-bold leading-none">
            {String(lesson.lesson).padStart(2, "0")}
          </span>
          <span className="text-[7.5px] uppercase tracking-[0.08em] opacity-80 mt-0.5">
            Lesson
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <h3 className="flex-1 min-w-0 text-[15px] sm:text-base font-semibold leading-snug text-[var(--ink-strong)] transition-colors duration-150 group-hover:text-[var(--accent)]">
              <Link
                href={`/atlas/${lesson.series}/${lesson.slug}`}
                className="no-underline text-inherit focus-visible:outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-[var(--accent)]"
              >
                <span className="sr-only">
                  Lesson {lesson.lesson} of {totalLessons}:{" "}
                </span>
                {lesson.title}
              </Link>
            </h3>
            {isNewest && (
              <span className="flex-shrink-0 text-[10px] font-bold text-[var(--accent-on-tint)] bg-[var(--accent)]/[0.08] px-2 py-0.5 rounded-full uppercase tracking-[0.05em]">
                New
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)] mt-1">
            <span>{lesson.readTime}</span>
            {lesson.date ? (
              <>
                <span aria-hidden="true" className="w-[3px] h-[3px] rounded-full bg-[var(--border-strong)]" />
                <span>{lesson.date}</span>
              </>
            ) : null}
          </div>
          {lesson.excerpt ? (
            <p
              data-testid="lesson-brief"
              className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-muted)] line-clamp-2"
            >
              {lesson.excerpt}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--border-subtle)] px-4 sm:px-5 py-2.5">
        {quiz && quiz.total > 0 ? (
          <LessonQuestionStatus quizName={quiz.quizName} total={quiz.total} />
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`hidden sm:inline-flex items-center gap-1 text-[12.5px] font-semibold ${CTA_TONE[state]}`}
          >
            {CTA_COPY[state]} &rarr;
          </span>
          {actions ? <div className="relative z-10 flex items-center">{actions}</div> : null}
        </div>
      </div>
    </article>
  );
}
