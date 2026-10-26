/**
 * /atlas/[series]/exam — exam page (server component).
 *
 * Every exam string is kind-aware (B3): the kicker, heading, meta line, locked
 * panel and guest CTA read `examLabels(s.examKind)`; counts come from the
 * series' exam.json and the duration / pass mark from `exam-config.ts`.
 *
 * Gating (ADR-104 + Decision 9):
 *  - Guest → GuestCTA (zero question text in HTML).
 *  - Authed, any check best < CERT_CHECK_PASS_PCT or missing → ExamLocked with
 *    per-check progress (rows link to the check pages).
 *  - Authed, every check ≥ CERT_CHECK_PASS_PCT → ExamWidget (timed, auto-submit,
 *    ≥ CERT_EXAM_PASS_PCT pass).
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ExamWidget from "@/components/Progress/ExamWidget";
import ExamLocked from "@/components/Progress/ExamLocked";
import GuestCTA from "@/components/Progress/GuestCTA";
import { learnSeries } from "@/data/learn";
import {
  getCertExam,
  getKnowledgeChecks,
} from "@/lib/quiz";
import { loadCheckScores } from "@/lib/check-scores";
import { getSeriesBySlug } from "@/lib/learn";
import { examLabels } from "@/lib/exam-labels";
import { buildMetadata } from "@/lib/seo";
import { getSupabaseServerClient } from "@/lib/db/server";
import { isDbTokenUnavailable } from "@/lib/db/degraded-client";
import { isPubliclyLaunchedSeries } from "@/lib/atlas-launch";
import type { CheckProgress } from "@/shared/contracts";
import {
  accessSeam,
  getAccessUserId,
  getCourseRowBySlug,
} from "@/lib/access";
import {
  buildDegradedPaywallView,
  buildPaywallView,
} from "@/lib/paywall";
import { LockedContentPage } from "@/components/Catalog/LockedContentPage";
import { getLessonsForSeries } from "@/lib/learn";
import {
  CERT_CHECK_PASS_PCT,
  CERT_EXAM_MINUTES,
  CERT_EXAM_PASS_PCT,
} from "@/lib/exam-config";

interface Props {
  params: Promise<{ series: string }>;
}

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return learnSeries
    .filter((s) => getCertExam(s.slug) !== null)
    .map((s) => ({ series: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { series } = await params;
  const exam = getCertExam(series);
  const s = getSeriesBySlug(series);
  if (!exam || !s) return {};
  // ADR-309: the head is composed from the kind's labels, never from
  // exam.json `title` (that field is the exam document's own heading).
  const labels = examLabels(s.examKind);
  return buildMetadata({
    title: labels.seoTitle(s.name),
    description: labels.seoDescription(s.name),
    path: `/atlas/${series}/exam`,
  });
}

export default async function ExamPage({ params }: Props) {
  const { series } = await params;
  const s = getSeriesBySlug(series);
  if (!s) notFound();

  const exam = getCertExam(series);
  if (!exam) notFound();

  // Access seam gate (ADR-201): DB-backed status + entitlements. not-launched →
  // 404; paywall → locked-content page (never the exam, never 404).
  const userId = await getAccessUserId();
  let decision: Awaited<ReturnType<typeof accessSeam.decideCourseAccess>> | null =
    null;
  let degraded = false;
  try {
    decision = await accessSeam.decideCourseAccess(userId, series);
  } catch (err) {
    // R2-5: a token-route failure is a classified degrade, never a 404/500.
    if (!isDbTokenUnavailable(err)) throw err;
    degraded = true;
  }
  if (decision?.kind === "not-launched") notFound();
  // F-2 (t_c4eafa3b MEDIUM, CWE-200): the degraded path cannot prove the series
  // is publicly launched, so fail CLOSED on EXISTENCE — an unpublished series
  // 404s under an outage exactly as the healthy seam does (R2-5 availability
  // for the seeded live series is unchanged).
  if (degraded && !isPubliclyLaunchedSeries(series)) notFound();
  if (degraded || decision?.kind === "paywall") {
    const lessons = getLessonsForSeries(series);
    const courseRow = degraded ? null : await getCourseRowBySlug(series);
    if (!degraded && !courseRow) notFound();
    return (
      <LockedContentPage
        seriesSlug={series}
        degraded={degraded}
        view={
          courseRow
            ? buildPaywallView({
                course: courseRow,
                series: s,
                peekLessonSlug: lessons[0]?.slug ?? null,
              })
            : buildDegradedPaywallView(s, lessons[0]?.slug ?? null)
        }
      />
    );
  }

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthed = Boolean(user);

  // Kind-aware labels + real counts for every surface on this page.
  const labels = examLabels(s.examKind);
  const checkMetas = getKnowledgeChecks(series);
  const questionCount = exam.questions.length;

  // Guest → CTA placeholder.
  if (!isAuthed) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main id="main" className="flex-1">
          <div className="max-w-[720px] mx-auto px-6 pt-10 pb-24">
            <Link
              href={`/atlas/${series}`}
              className="inline-flex items-center gap-1.5 text-gray-500 text-xs font-medium no-underline mb-5 hover:text-navy transition-colors duration-150"
            >
              &larr; Back to {s.name}
            </Link>
            <div className="flex items-center gap-2 font-mono text-[11.5px] font-bold text-navy uppercase tracking-[0.08em] mb-[14px]">
              <span className="w-[3px] h-3 rounded-sm bg-navy" />
              {labels.short}
            </div>
            <h1 className="text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold text-navy tracking-[-0.02em] leading-tight mb-3">
              {labels.full}
            </h1>
            <p className="text-[15px] text-gray-500 max-w-[600px] leading-relaxed mb-7">
              {questionCount} questions · {CERT_EXAM_MINUTES} minutes · pass ≥ {CERT_EXAM_PASS_PCT}%
            </p>
            <GuestCTA
              tier="exam"
              kind={s.examKind}
              checkCount={checkMetas.length}
              questionCount={questionCount}
              minutes={CERT_EXAM_MINUTES}
            />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Authed — derive per-check scores from server-graded quiz_attempt rows
  // (security t_7469e31d F2: quiz_run is client-writable history, so the
  // unlock decision must never depend on it). A6 moved the derivation into
  // `lib/check-scores.ts` so the lesson page's "has check 1 passed?" answer is
  // the same read this gate makes — behaviour here is unchanged.
  const scores = await loadCheckScores(supabase, user!.id, series, checkMetas);

  const checks: CheckProgress[] = checkMetas.map((c) => {
    const bestScore = scores.get(c.n)?.bestScore ?? 0;
    return { n: c.n, bestScore, attempts: 0, passed: bestScore >= CERT_CHECK_PASS_PCT };
  });
  const allChecksPassed = checks.every((c) => c.passed);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main" className="flex-1">
        {allChecksPassed ? (
          <ExamWidget
            quizName={exam.quizName}
            // F3 (CWE-200): strip the answer key server-side — the client
            // bundle must never contain correct_answer_index/explanation.
            // Grading happens server-side in POST /api/progress/quiz/batch.
            questions={exam.questions.map(({ question, options }) => ({
              question,
              options,
            }))}
            seriesSlug={series}
            seriesName={s.name}
            kind={s.examKind}
          />
        ) : (
          <div className="pt-6">
            <Link
              href={`/atlas/${series}`}
              className="max-w-[720px] mx-auto px-6 inline-flex items-center gap-1.5 text-gray-500 text-xs font-medium no-underline mb-2 hover:text-navy transition-colors duration-150"
            >
              &larr; Back to {s.name}
            </Link>
            <ExamLocked
              series={series}
              checks={checks}
              seriesName={s.name}
              kind={s.examKind}
              minutes={CERT_EXAM_MINUTES}
            />
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
