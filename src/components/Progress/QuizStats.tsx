/**
 * QuizStats — "Quiz avg 82% · 3 attempts" mono strip (design brief §5.3).
 *
 * Reads quiz stats from two sources and merges them:
 *  - localStorage (authoritative client copy via useQuizProgress)
 *  - the caller's quiz_run aggregates, shipped with the shared
 *    GET /api/progress/summary read (`quizStats`) for authed users
 *
 * PERF (t_22e18719): this used to issue GET /api/progress/quiz/run per strip,
 * so the signed-in /atlas hub fired one such request per card. It now reads the
 * one summary payload the pages already fetch for the progress bars.
 *
 * Renders nothing when there are no attempts — never invents stats.
 */
"use client";

import Link from "next/link";
import { useQuizProgress } from "@/lib/hooks/useQuizProgress";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  useSessionQuizStats,
  type ProgressQuizStats,
} from "@/lib/hooks/useProgressSummary";

interface QuizStatsProps {
  seriesSlug: string;
  /** Where the strip sits — controls onGradient (white) treatment. */
  onGradient?: boolean;
  /**
   * Rendering mode. "link" (default) wraps the strip in a <Link> to the quiz.
   * "span" renders a plain informational strip — use when the parent is already
   * a link (nested anchors are invalid HTML and trigger React hydration errors).
   */
  as?: "link" | "span";
  /**
   * Tier scope (ADR-101). "all" (default) aggregates the legacy series quiz
   * (bare seriesSlug quizName). "lesson" | "check" | "exam" aggregate a single
   * tier's quizName (`<series>:<scope>`). Kept for non-tier series that still
   * use the legacy quiz page; tier series render CertReadiness instead.
   */
  scope?: "lesson" | "check" | "exam" | "all";
}

export default function QuizStats({
  seriesSlug,
  onGradient = false,
  as = "link",
  scope = "all",
}: QuizStatsProps) {
  // Tier-scoped quizName (ADR-101): "all" keeps the legacy bare series name;
  // a tier scope aggregates `<series>:<scope>` (e.g. "omni-studio-cert:exam").
  const quizName = scope === "all" ? seriesSlug : `${seriesSlug}:${scope}`;
  const { progress, hydrated } = useQuizProgress(quizName);
  const { user } = useAuth();

  // Local stats: bestScore + attemptCount persisted by useQuizProgress
  const localAttempts = progress.attemptCount;
  const localBest = progress.bestScore;

  // Cross-device stats come from the ONE shared `/api/progress/summary` read
  // (PERF t_22e18719) instead of one `/api/progress/quiz/run` per card. A
  // missing entry means the user has no server-side runs for this quiz, so the
  // localStorage copy stays authoritative. Guests never trigger the read.
  const server: ProgressQuizStats | null = useSessionQuizStats(quizName, !!user);

  // Merge: server wins for authed users (cross-device), local as fallback
  const attempts = user ? (server?.attempts ?? localAttempts) : localAttempts;
  const best = user ? (server?.bestScore ?? localBest) : localBest;

  // Hydration gate (QA F-1): until useQuizProgress has read the stored
  // state after mount, progress is the empty state. Rendering the strip
  // only after hydration keeps server HTML and the client's first paint
  // identical (no hydration error for returning users with saved attempts).
  if (!hydrated || attempts === 0) return null;

  const tone = onGradient
    ? "text-white bg-black/55 backdrop-blur-sm px-2.5 py-1 rounded-full"
    : "text-gray-500";

  const content = (
    <>
      <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
      Quiz avg {best}% &middot; {attempts} {attempts === 1 ? "attempt" : "attempts"}
    </>
  );

  // Non-interactive strip: parent is already a link (e.g. PathCard) — nested
  // anchors are invalid HTML and trigger React hydration errors.
  if (as === "span") {
    return (
      <span className={`inline-flex items-center gap-2 font-mono text-[10.5px] font-semibold ${tone}`}>
        {content}
      </span>
    );
  }

  return (
    <Link
      href={
        scope === "exam"
          ? `/atlas/${seriesSlug}/exam`
          : scope !== "all"
            ? `/atlas/${seriesSlug}/check/${scope}`
            : `/atlas/${seriesSlug}/quiz`
      }
      className={`inline-flex items-center gap-2 font-mono text-[10.5px] font-semibold no-underline transition-colors duration-150 active:scale-[0.98] ${tone} ${
        onGradient ? "hover:text-white" : "hover:text-navy"
      }`}
    >
      {content}
    </Link>
  );
}
