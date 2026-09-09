/**
 * CertificateSection — "My certificates" on /profile (server component).
 *
 * Derives eligibility for every cert-capable series (has a cert exam file)
 * from the authenticated user's lesson_completion + quiz_attempt rows — the
 * same on-demand derivation as the certificate page (ADR-106). Renders a list
 * of earned certificates with a link to each printable cert, or an empty state.
 */

import Link from "next/link";
import { learnSeries } from "@/data/learn";
import { getSeriesBySlug } from "@/lib/learn";
import { getCertExam, getKnowledgeCheck, getKnowledgeChecks, scoreQuizAttemptRows } from "@/lib/quiz";
import {
  buildCertificateEligibility,
  certificateCompletionDate,
  certificateCourseName,
  formatCertDate,
  getSeriesLessonSlugs,
} from "@/lib/certificate";
import type { SupabaseServerClient } from "@/lib/supabase/server";

interface CertificateSectionProps {
  supabase: SupabaseServerClient;
  userId: string;
}

function CertSeal() {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-inverse)] text-[var(--ink-on-inverse)]">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[22px] w-[22px]" aria-hidden="true">
        <circle cx="12" cy="8" r="5" />
        <path d="M8.5 12.5L7 21l5-3 5 3-1.5-8.5" />
      </svg>
    </div>
  );
}

export default async function CertificateSection({
  supabase,
  userId,
}: CertificateSectionProps) {
  // Only series with a cert exam can grant certificates.
  const certSeries = learnSeries.filter((s) => getCertExam(s.slug) !== null);

  if (certSeries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-strong)] p-7 text-center text-[13px] text-[var(--ink-faint)]">
        No certificates yet. Complete a learning path and pass its exam to earn your first one.
      </div>
    );
  }

  // Gather the data once for all cert series (two queries total).
  const allSlugs = certSeries.flatMap((s) => getSeriesLessonSlugs(s.slug));
  const checkNames = certSeries.flatMap((s) =>
    getKnowledgeChecks(s.slug).map((c) => `${s.slug}:check:${c.n}`),
  );
  const examNames = certSeries.map((s) => `${s.slug}:exam`);

  const [lessonRes, attemptRes] = await Promise.all([
    allSlugs.length > 0
      ? supabase
          .from("lesson_completion")
          .select("lesson_slug")
          .eq("user_id", userId)
          .in("lesson_slug", allSlugs)
      : Promise.resolve({ data: [] as { lesson_slug: string }[], error: null }),
    supabase
      .from("quiz_attempt")
      .select("quiz_name, question_index, is_correct, attempted_at")
      .eq("user_id", userId)
      .in("quiz_name", [...checkNames, ...examNames]),
  ]);

  const completed = new Set(
    ((lessonRes.data ?? []) as { lesson_slug: string }[]).map((r) => r.lesson_slug),
  );
  const attempts = (attemptRes.data ?? []) as {
    quiz_name: string;
    question_index: number;
    is_correct: boolean;
    attempted_at?: string | null;
  }[];

  const earned: {
    seriesSlug: string;
    courseName: string;
    completedAtIso: string;
    examBest: number;
  }[] = [];

  for (const s of certSeries) {
    const lessonSlugs = getSeriesLessonSlugs(s.slug);
    const totalLessons = lessonSlugs.length;
    const checkMetas = getKnowledgeChecks(s.slug);
    const checkQuizNames = checkMetas.map((c) => `${s.slug}:check:${c.n}`);
    const examQuizName = `${s.slug}:exam`;
    const examCanonical = getCertExam(s.slug)?.questions.length;

    const examAttempts = attempts.filter((r) => r.quiz_name === examQuizName);
    const examScore = scoreQuizAttemptRows(examAttempts, examCanonical);
    const examRuns = examScore
      ? [{ score: examScore.score, completedAt: examAttempts.reduce<string | null>((m, r) => (r.attempted_at && r.attempted_at > (m ?? "") ? r.attempted_at : m), null) }]
      : [];

    const checkRuns = checkQuizNames
      .map((name, i) => {
        const canonical = checkMetas[i] ? getKnowledgeCheck(s.slug, checkMetas[i]!.n)?.questions.length : undefined;
        const sc = scoreQuizAttemptRows(
          attempts.filter((r) => r.quiz_name === name),
          canonical,
        );
        return sc ? { quizName: name, score: sc.score } : null;
      })
      .filter((r): r is { quizName: string; score: number } => r !== null);

    const eligibility = buildCertificateEligibility({
      completedLessonSlugs: lessonSlugs.filter((slug) => completed.has(slug)),
      totalLessons,
      examRuns,
      checkRuns,
      checkQuizNames,
    });

    if (eligibility.eligible) {
      earned.push({
        seriesSlug: s.slug,
        courseName: certificateCourseName(s.slug, getSeriesBySlug(s.slug)?.name ?? s.name),
        completedAtIso: certificateCompletionDate(examRuns) ?? new Date().toISOString(),
        examBest: eligibility.examBest,
      });
    }
  }

  if (earned.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-strong)] p-7 text-center text-[13px] text-[var(--ink-faint)]">
        <div className="mx-auto mb-2.5 flex h-9 w-9 items-center justify-center text-[var(--ink-faint)] opacity-60">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-full w-full" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        No certificates yet. Complete a learning path and pass its exam to earn your first one.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {earned.map((cert) => (
        <div
          key={cert.seriesSlug}
          className="flex items-center gap-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card-soft)] px-[18px] py-4 transition-all duration-150 hover:border-[var(--border-strong)] hover:shadow-card"
        >
          <CertSeal />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-bold text-[var(--ink-primary)]">{cert.courseName}</div>
            <div className="mt-0.5 font-mono text-[12px] text-[var(--ink-faint)]">
              Earned {formatCertDate(cert.completedAtIso)} · passed {cert.examBest}%
            </div>
          </div>
          <Link
            href={`/learn/${cert.seriesSlug}/certificate`}
            className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap text-[13px] font-bold text-[var(--accent)] no-underline hover:text-[var(--accent-hover)] transition-colors duration-150"
          >
            View cert
          </Link>
        </div>
      ))}
    </div>
  );
}
