/**
 * /learn/[series]/exam — cert prep exam page (server component).
 *
 * Gating (ADR-104 + Decision 9):
 *  - Guest → GuestCTA (zero question text in HTML).
 *  - Authed, any check best < 80 or missing → ExamLocked with per-check
 *    progress (rows link to the check pages).
 *  - Authed, all 9 checks ≥ 80 → ExamWidget (timed, auto-submit, ≥72% pass).
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
  getKnowledgeCheck,
  getKnowledgeChecks,
  scoreQuizAttemptsByQuiz,
} from "@/lib/quiz";
import { getSeriesBySlug } from "@/lib/learn";
import { buildMetadata } from "@/lib/seo";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { CheckProgress } from "@/shared/contracts";
import {
  accessSeam,
  getAccessUserId,
  getCourseRowBySlug,
} from "@/lib/access";
import { buildPaywallView } from "@/lib/paywall";
import { LockedContentPage } from "@/components/Catalog/LockedContentPage";
import { getLessonsForSeries } from "@/lib/learn";

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
  return buildMetadata({
    title: `${exam.title} | Adroit Learn`,
    description: exam.description ?? `Certification prep exam for ${s.name}.`,
    path: `/learn/${series}/exam`,
  });
}

const CHECK_PASS_PCT = 80;

export default async function ExamPage({ params }: Props) {
  const { series } = await params;
  const s = getSeriesBySlug(series);
  if (!s) notFound();

  const exam = getCertExam(series);
  if (!exam) notFound();

  // Access seam gate (ADR-201): DB-backed status + entitlements. not-launched →
  // 404; paywall → locked-content page (never the exam, never 404).
  const userId = await getAccessUserId();
  const decision = await accessSeam.decideCourseAccess(userId, series);
  if (decision.kind === "not-launched") notFound();
  if (decision.kind === "paywall") {
    const courseRow = await getCourseRowBySlug(series);
    if (!courseRow) notFound();
    const lessons = getLessonsForSeries(series);
    return (
      <LockedContentPage
        seriesSlug={series}
        view={buildPaywallView({
          course: courseRow,
          series: s,
          peekLessonSlug: lessons[0]?.slug ?? null,
        })}
      />
    );
  }

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthed = Boolean(user);

  // Guest → CTA placeholder.
  if (!isAuthed) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main id="main" className="flex-1">
          <div className="max-w-[720px] mx-auto px-6 pt-10 pb-24">
            <Link
              href={`/learn/${series}`}
              className="inline-flex items-center gap-1.5 text-gray-500 text-xs font-medium no-underline mb-5 hover:text-navy transition-colors duration-150"
            >
              &larr; Back to {s.name}
            </Link>
            <div className="flex items-center gap-2 font-mono text-[11.5px] font-bold text-navy uppercase tracking-[0.08em] mb-[14px]">
              <span className="w-[3px] h-3 rounded-sm bg-navy" />
              Cert Prep Exam
            </div>
            <h1 className="text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold text-navy tracking-[-0.02em] leading-tight mb-3">
              Certification Prep Exam
            </h1>
            <p className="text-[15px] text-gray-500 max-w-[600px] leading-relaxed mb-7">
              60 questions · 105 minutes · pass ≥ 72%
            </p>
            <GuestCTA tier="exam" ariaLabel="Cert prep exam locked" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Authed — derive per-check scores from server-graded quiz_attempt rows
  // (security t_7469e31d F2: quiz_run is client-writable history, so the
  // unlock decision must never depend on it).
  const checkMetas = getKnowledgeChecks(series);
  const quizNames = checkMetas.map((c) => `${series}:check:${c.n}`);
  const { data } = await supabase
    .from("quiz_attempt")
    .select("quiz_name, question_index, is_correct")
    .eq("user_id", user!.id)
    .in("quiz_name", quizNames);

  // Canonical coverage (t_55105899): a check with only 8 of 15 questions
  // answered (all correct) must NOT derive as 8/8 = 100% and unlock the
  // exam. Only full-coverage attempt sets produce a score.
  const canonicalTotals = new Map<string, number>();
  for (const c of checkMetas) {
    const quiz = getKnowledgeCheck(series, c.n);
    if (quiz) canonicalTotals.set(`${series}:check:${c.n}`, quiz.questions.length);
  }
  const scoresByQuiz = scoreQuizAttemptsByQuiz(
    (data ?? []) as {
      quiz_name: string;
      question_index: number;
      is_correct: boolean;
    }[],
    canonicalTotals,
  );

  const checks: CheckProgress[] = checkMetas.map((c) => {
    const bestScore = scoresByQuiz.get(`${series}:check:${c.n}`)?.score ?? 0;
    return { n: c.n, bestScore, attempts: 0, passed: bestScore >= CHECK_PASS_PCT };
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
          />
        ) : (
          <div className="pt-6">
            <Link
              href={`/learn/${series}`}
              className="max-w-[720px] mx-auto px-6 inline-flex items-center gap-1.5 text-gray-500 text-xs font-medium no-underline mb-2 hover:text-navy transition-colors duration-150"
            >
              &larr; Back to {s.name}
            </Link>
            <ExamLocked series={series} checks={checks} seriesName={s.name} />
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
