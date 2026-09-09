/**
 * /learn/[series]/check/[n] — knowledge check page (SSG params 1..9).
 *
 * Server-side session gate (ADR-104): guests see the sign-up CTA placeholder
 * with ZERO question text in the HTML; authed users see the 15-question
 * QuizWidget. Pass rule: best score ≥ 80 (80 flat passes — Decision 9).
 *
 * The pass-status row is rendered server-side from the user's quiz_run rows so
 * the header reflects the latest best score without a client fetch.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import QuizWidget from "@/components/Progress/QuizWidget";
import GuestCTA from "@/components/Progress/GuestCTA";
import { learnSeries } from "@/data/learn";
import {
  getKnowledgeCheck,
  getKnowledgeChecks,
} from "@/lib/quiz";
import { getSeriesBySlug } from "@/lib/learn";
import { buildMetadata } from "@/lib/seo";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  accessSeam,
  getAccessUserId,
  getCourseRowBySlug,
} from "@/lib/access";
import { buildPaywallView } from "@/lib/paywall";
import { LockedContentPage } from "@/components/Catalog/LockedContentPage";
import { getLessonsForSeries } from "@/lib/learn";

interface Props {
  params: Promise<{ series: string; n: string }>;
}

export const dynamic = "force-dynamic";

/** SSG params: every check index shipped by each series (omni-studio-cert → 1..9). */
export async function generateStaticParams() {
  return learnSeries.flatMap((s) =>
    getKnowledgeChecks(s.slug).map((c) => ({ series: s.slug, n: String(c.n) })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { series, n } = await params;
  const check = getKnowledgeCheck(series, parseInt(n, 10));
  const s = getSeriesBySlug(series);
  if (!check || !s) return {};
  return buildMetadata({
    title: `${check.title} | Adroit Learn`,
    description: check.description ?? `Knowledge check for ${s.name}.`,
    path: `/learn/${series}/check/${n}`,
  });
}

export default async function KnowledgeCheckPage({ params }: Props) {
  const { series, n: nRaw } = await params;
  const n = parseInt(nRaw, 10);
  const s = getSeriesBySlug(series);
  if (!s) notFound();

  const check = getKnowledgeCheck(series, n);
  if (!check) notFound();

  // Verify n is within the actual check range (defense-in-depth).
  const metas = getKnowledgeChecks(series);
  const meta = metas.find((c) => c.n === n);
  if (!meta) notFound();
  const [lessonStart, lessonEnd] = meta.lessons;

  // Access seam gate (ADR-201): DB-backed status + entitlements. not-launched →
  // 404; paywall → locked-content page (never the quiz, never 404).
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

  // Server-side session gate (ADR-104).
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthed = Boolean(user);

  // Best score for the pass-status row (authed only).
  let bestScore = 0;
  if (isAuthed) {
    const quizName = check.quizName;
    const { data } = await supabase
      .from("quiz_run")
      .select("score")
      .eq("user_id", user!.id)
      .eq("quiz_name", quizName);
    const scores = (data ?? []) as { score: number }[];
    if (scores.length > 0) bestScore = Math.max(...scores.map((r) => r.score));
  }
  const passed = bestScore >= 80;

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

          {/* Milestone kicker + title (copy deck §2) */}
          <div className="flex items-center gap-2 font-mono text-[11.5px] font-bold text-red uppercase tracking-[0.08em] mb-[14px]">
            <span className="w-[3px] h-3 rounded-sm bg-red" />
            Knowledge Check {n} · Lessons {lessonStart}–{lessonEnd}
          </div>
          <h1 className="text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold text-navy tracking-[-0.02em] leading-tight mb-3">
            Knowledge Check {n}
          </h1>
          <p className="text-[15px] text-gray-500 max-w-[600px] leading-relaxed mb-6">
            {check.description}
          </p>

          {/* Pass-status row — Monitor signal (copy deck §2) */}
          {isAuthed && (
            <div
              className={`inline-flex items-center gap-2 font-mono text-[11px] font-bold px-3.5 py-1.5 rounded-full mb-7 ${
                passed
                  ? "bg-emerald/10 text-emerald-800"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              <span
                aria-hidden="true"
                className={`w-2 h-2 rounded-full ${
                  passed ? "bg-emerald" : "bg-gray-300"
                }`}
              />
              {passed ? `Passed · ${bestScore}% best` : "Not yet passed · 80% required"}
            </div>
          )}

          {!isAuthed ? (
            <GuestCTA tier="check" ariaLabel="Knowledge check locked" />
          ) : (
            <QuizWidget
              quizName={check.quizName}
              // F2 (CWE-200, t_79a92b83): strip the answer key server-side —
              // the check page must NEVER ship correct_answer_index/explanation
              // in the RSC payload (mirrors exam/page.tsx). QuizWidget grades
              // each answer via POST /api/progress/quiz and renders feedback
              // from the response; the unlock gate stays server-side.
              questions={check.questions.map(({ question, options }) => ({
                question,
                options,
              }))}
              serverGraded
              kicker={`Knowledge Check ${n} · 15 questions`}
              passThreshold={80}
              retakeLabel="Retake check"
              backHref={`/learn/${series}`}
              backLabel="Back to series"
            />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
