/**
 * /learn/[series]/certificate — certificate of completion page (server).
 *
 * ADR-104 gating + ADR-106 on-demand derivation:
 *  - Guest → GuestCTA placeholder (zero question/cert text in HTML).
 *  - Authed → derive eligibility from lesson_completion + server-graded
 *    quiz_attempt rows (NO certificates table; security t_7469e31d F2 — the
 *    pass decision never reads the client-writable quiz_run history).
 *    Eligible → printable Certificate; not eligible → checklist state
 *    showing exactly what's missing.
 *
 * Rule (course-progression pattern): all {totalLessons} lessons completed AND
 * exam score >= 72%. The slug set counted against "all lessons" is the
 * generator's planned lesson set (content/learn/<series>/questions/<slug>.json),
 * so unpublished lessons with sidecar JSONs still count toward completion.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Certificate from "@/components/Progress/Certificate";
import GuestCTA from "@/components/Progress/GuestCTA";
import { learnSeries } from "@/data/learn";
import {
  getCertExam,
  getKnowledgeCheck,
  getKnowledgeChecks,
  scoreQuizAttemptRows,
} from "@/lib/quiz";
import { getSeriesBySlug } from "@/lib/learn";
import { buildMetadata } from "@/lib/seo";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildCertificateEligibility,
  certificateCompletionDate,
  certificateCourseName,
  certificateRecipientName,
  formatCertDate,
  getSeriesLessonSlugs,
} from "@/lib/certificate";
import {
  accessSeam,
  getAccessUserId,
  getCourseRowBySlug,
} from "@/lib/access";
import { buildPaywallView } from "@/lib/paywall";
import { LockedContentPage } from "@/components/Catalog/LockedContentPage";
import { getLessonsForSeries } from "@/lib/learn";
import { appendCompletionEvent } from "@/lib/completion";
import CertificateCelebration from "@/components/Constellations/CertificateCelebration";
import { loadSeriesConstellation, loadAchievementStats } from "@/lib/sky-server";

interface Props {
  params: Promise<{ series: string }>;
}

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  // Prerender every series' certificate route (exam-less series render the
  // interim "completion record / exam coming soon" state per backlog B-07 / D2).
  return learnSeries.map((s) => ({ series: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { series } = await params;
  const s = getSeriesBySlug(series);
  if (!s) return {};
  const hasExam = getCertExam(series) !== null;
  return buildMetadata({
    title: hasExam
      ? `Certificate of Completion | ${s.name} | Adroit Learn`
      : `Completion Record | ${s.name} | Adroit Learn`,
    description: hasExam
      ? `Printable certificate of completion for the ${s.name} course: all lessons completed and the cert prep exam passed at 72% or higher.`
      : `Course completion record for ${s.name}: track the lessons you've completed. The certificate prep exam for this path is being authored and will unlock a printable certificate.`,
    path: `/learn/${series}/certificate`,
  });
}

export default async function CertificatePage({ params }: Props) {
  const { series } = await params;
  const s = getSeriesBySlug(series);
  if (!s) notFound();

  // Certificate is a tier-course feature. Exam-less series do NOT 404 (backlog
  // B-07 / D2): they render an interim "completion record / exam coming soon"
  // state while the prep exam is authored. Only a missing series 404s.
  const hasExam = getCertExam(series) !== null;

  // Access seam gate (ADR-201): DB-backed status + entitlements. not-launched →
  // 404; paywall → locked-content page (never the cert, never 404).
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

  // Exam-less series → interim "completion record / exam coming soon" state
  // (backlog B-07 / D2). Keeps the certificate promise visible instead of a
  // bare 404 while the prep exam is authored.
  if (!hasExam) {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const lessonSlugs = getSeriesLessonSlugs(series);
    const totalLessons = lessonSlugs.length || s.totalLessons;

    const completionHead = (
      <>
        <Link
          href={`/learn/${series}`}
          className="inline-flex items-center gap-1.5 text-gray-500 text-xs font-medium no-underline mb-5 hover:text-navy transition-colors duration-150"
        >
          &larr; Back to {s.name}
        </Link>
        <div className="flex items-center gap-2 font-mono text-[11.5px] font-bold text-red uppercase tracking-[0.08em] mb-[14px]">
          <span className="w-[3px] h-3 rounded-sm bg-red" />
          Completion Record
        </div>
        <h1 className="text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold text-navy tracking-[-0.02em] leading-tight mb-3">
          {s.name} — your progress
        </h1>
        <p className="text-[15px] text-gray-500 max-w-[600px] leading-relaxed mb-7">
          This learning path tracks every lesson you complete. The certificate prep
          exam is being authored — once it ships, passing it at 72%+ earns your
          printable certificate of completion.
        </p>
      </>
    );

    if (!user) {
      return (
        <div className="min-h-screen flex flex-col">
          <Header />
          <main id="main" className="flex-1">
            <div className="max-w-[720px] mx-auto px-6 pt-10 pb-24">
              {completionHead}
              <GuestCTA tier="certificate" ariaLabel="Completion record locked" />
            </div>
          </main>
          <Footer />
        </div>
      );
    }

    // Authed — show lessons completed against the planned lesson set.
    let completedCount = 0;
    if (lessonSlugs.length > 0) {
      const { data } = await supabase
        .from("lesson_completion")
        .select("lesson_slug")
        .eq("user_id", user.id)
        .in("lesson_slug", lessonSlugs);
      completedCount = Math.min(
        new Set((data ?? []).map((r) => (r as { lesson_slug: string }).lesson_slug)).size,
        totalLessons,
      );
    }
    const allDone = totalLessons > 0 && completedCount >= totalLessons;

    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main id="main" className="flex-1">
          <div className="max-w-[720px] mx-auto px-6 pt-10 pb-24">
            {completionHead}
            <div className="max-w-[640px] bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
              <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-gray-500 uppercase tracking-[0.09em] mb-2">
                <span className="w-[3px] h-3 rounded-sm bg-gray-500" />
                Course completion
              </div>
              <h2 className="text-[1.2rem] font-extrabold text-navy tracking-[-0.02em] mb-2">
                {allDone ? "Path complete — exam coming soon" : `Complete all ${totalLessons} lessons`}
              </h2>
              <p className="text-[13.5px] text-gray-600 leading-relaxed mb-[18px]">
                {allDone
                  ? "You've finished every lesson in this path. Your certificate unlocks once the cert prep exam is published — check back soon."
                  : "Finish the remaining lessons to complete this path. Your certificate unlocks once the cert prep exam is published."}
              </p>
              <div className="flex items-center gap-2.5 text-[13px] text-gray-600">
                <span
                  className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center ${
                    allDone ? "bg-[var(--signal-done-bg)] text-[var(--signal-done)]" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {allDone ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                </span>
                <span>All {totalLessons} lessons completed</span>
                <span className="font-mono text-[11px] text-gray-500 ml-auto">
                  {completedCount}/{totalLessons}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-[13px] text-gray-600 mt-3">
                <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center bg-gray-100 text-gray-500">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </span>
                <span>Cert prep exam (coming soon)</span>
                <span className="font-mono text-[11px] text-gray-500 ml-auto">Not available</span>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // The "all 46 lessons" rule counts against the course's PLANNED lesson set
  // (the generator's 46 sidecar files), not the published-lesson count
  // (`s.totalLessons` is only 8 today — build-learn.js tracks published MDX).
  const lessonSlugs = getSeriesLessonSlugs(series);
  const totalLessons = lessonSlugs.length;

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthed = Boolean(user);

  const pageHead = (
    <>
      <Link
        href={`/learn/${series}`}
        className="inline-flex items-center gap-1.5 text-gray-500 text-xs font-medium no-underline mb-5 hover:text-navy transition-colors duration-150"
      >
        &larr; Back to {s.name}
      </Link>
      <div className="flex items-center gap-2 font-mono text-[11.5px] font-bold text-red uppercase tracking-[0.08em] mb-[14px]">
        <span className="w-[3px] h-3 rounded-sm bg-red" />
        Certificate of Completion
      </div>
      <h1 className="text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold text-navy tracking-[-0.02em] leading-tight mb-3">
        Your certificate
      </h1>
      <p className="text-[15px] text-gray-500 max-w-[600px] leading-relaxed mb-7">
        Issued by Adroit Consulting when all {totalLessons} lessons are completed and the cert
        prep exam is passed at 72% or higher.
      </p>
    </>
  );

  // Guest → CTA placeholder.
  if (!isAuthed) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main id="main" className="flex-1">
          <div className="max-w-[720px] mx-auto px-6 pt-10 pb-24">
            {pageHead}
            <GuestCTA tier="certificate" ariaLabel="Certificate locked" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Authed — derive eligibility from server-graded quiz_attempt rows (ADR-106;
  // security t_7469e31d F2: quiz_run is client-writable history and must not
  // grant a certificate, so the pass decision never reads it).
  const checkMetas = getKnowledgeChecks(series);
  const checkQuizNames = checkMetas.map((c) => `${series}:check:${c.n}`);
  const examQuizName = `${series}:exam`;

  const [lessonRes, attemptRes] = await Promise.all([
    lessonSlugs.length > 0
      ? supabase
          .from("lesson_completion")
          .select("lesson_slug")
          .eq("user_id", user!.id)
          .in("lesson_slug", lessonSlugs)
      : Promise.resolve({ data: [] as { lesson_slug: string }[], error: null }),
    supabase
      .from("quiz_attempt")
      .select("quiz_name, question_index, is_correct, attempted_at")
      .eq("user_id", user!.id)
      .in("quiz_name", [...checkQuizNames, examQuizName]),
  ]);

  const completedLessonSlugs = ((lessonRes.data ?? []) as { lesson_slug: string }[]).map(
    (r) => r.lesson_slug,
  );

  const attemptRows = (attemptRes.data ?? []) as {
    quiz_name: string;
    question_index: number;
    is_correct: boolean;
    attempted_at?: string | null;
  }[];

  // Exam: score from the graded attempt set; completion date = the latest
  // graded exam answer (quiz_attempt has no run boundaries).
  // Canonical coverage (t_55105899): a partial exam answer set (e.g. 40 of
  // 60 questions, all correct) must NOT derive as 40/40 = 100% and grant a
  // certificate — only a full-coverage set is a valid exam score.
  const examCanonical = getCertExam(series)?.questions.length;
  const examAttempts = attemptRows.filter((r) => r.quiz_name === examQuizName);
  const examScore = scoreQuizAttemptRows(examAttempts, examCanonical);
  const examRuns = examScore
    ? [
        {
          score: examScore.score,
          completedAt:
            examAttempts.reduce<string | null>(
              (max, r) => (r.attempted_at && r.attempted_at > (max ?? "") ? r.attempted_at : max),
              null,
            ) ?? null,
        },
      ]
    : [];

  // Checks: one derived score per check quizName (latest graded answer set),
  // each validated against its canonical question count (t_55105899).
  const checkRuns = checkQuizNames
    .map((quizName, i) => {
      const canonical = checkMetas[i] ? getKnowledgeCheck(series, checkMetas[i]!.n)?.questions.length : undefined;
      const s = scoreQuizAttemptRows(
        attemptRows.filter((r) => r.quiz_name === quizName),
        canonical,
      );
      return s ? { quizName, score: s.score } : null;
    })
    .filter((r): r is { quizName: string; score: number } => r !== null);

  const eligibility = buildCertificateEligibility({
    completedLessonSlugs,
    totalLessons,
    examRuns,
    checkRuns,
    checkQuizNames,
  });

  if (!eligibility.eligible) {
    const lessonsDone = eligibility.lessonsCompleted >= eligibility.lessonsTotal;
    const examStatus =
      eligibility.examBest === 0
        ? "Not taken"
        : eligibility.examPassed
          ? `${eligibility.examBest}% · passed`
          : `${eligibility.examBest}% · not yet`;
    const checksDone = eligibility.checksPassed >= eligibility.checksTotal;

    const OkIcon = (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
    const NoIcon = (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );

    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main id="main" className="flex-1">
          <div className="max-w-[720px] mx-auto px-6 pt-10 pb-24">
            {pageHead}

            <div className="max-w-[640px] bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
              <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-gray-500 uppercase tracking-[0.09em] mb-2">
                <span className="w-[3px] h-3 rounded-sm bg-gray-500" />
                Certificate not yet available
              </div>
              <h2 className="text-[1.2rem] font-extrabold text-navy tracking-[-0.02em] mb-2">
                Complete all {eligibility.lessonsTotal} lessons and pass the exam with 72%+
              </h2>
              <p className="text-[13.5px] text-gray-600 leading-relaxed mb-[18px]">
                Your certificate unlocks once both conditions are met. Here&apos;s where you
                stand:
              </p>
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5 text-[13px] text-gray-600">
                  <span
                    className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center ${
                      lessonsDone
                        ? "bg-[var(--signal-done-bg)] text-[var(--signal-done)]"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {lessonsDone ? OkIcon : NoIcon}
                  </span>
                  <span>
                    All {eligibility.lessonsTotal} lessons completed
                  </span>
                  <span className="font-mono text-[11px] text-gray-500 ml-auto">
                    {eligibility.lessonsCompleted}/{eligibility.lessonsTotal}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-[13px] text-gray-600">
                  <span
                    className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center ${
                      eligibility.examPassed
                        ? "bg-[var(--signal-done-bg)] text-[var(--signal-done)]"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {eligibility.examPassed ? OkIcon : NoIcon}
                  </span>
                  <span>Cert prep exam passed (≥ 72%)</span>
                  <span className="font-mono text-[11px] text-gray-500 ml-auto">{examStatus}</span>
                </div>
                <div className="flex items-center gap-2.5 text-[13px] text-gray-600">
                  <span
                    className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center ${
                      checksDone ? "bg-[var(--signal-done-bg)] text-[var(--signal-done)]" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {checksDone ? OkIcon : NoIcon}
                  </span>
                  <span>
                    <b className="text-gray-800">Exam unlocked</b> — all {eligibility.checksTotal}{" "}
                    knowledge checks ≥ 80%
                  </span>
                  <span className="font-mono text-[11px] text-gray-500 ml-auto">
                    {eligibility.checksPassed}/{eligibility.checksTotal} checks
                  </span>
                </div>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Eligible — printable certificate.
  const completedAtIso = certificateCompletionDate(examRuns) ?? new Date().toISOString();

  // B-19 (ADR-216): append the single, durable 'certificate' event. Idempotent
  // per (user, course, event_type='certificate') — appendCompletionEvent skips
  // duplicates so exactly one row is ever logged for this course. Best-effort:
  // a log failure never blocks the printable certificate. The event's
  // `certifiedAt` records when eligibility was reached.
  const certCourse = await getCourseRowBySlug(series);
  if (certCourse) {
    await appendCompletionEvent({
      userId: user!.id,
      courseId: certCourse.id,
      eventType: "certificate",
      metadata: { certifiedAt: completedAtIso },
    });
  }

  // Constellation + Chronicle (B-18): celebration above the printable sheet.
  const constellation = await loadSeriesConstellation({
    seriesSlug: series,
    name: certificateCourseName(series, s.name),
    gradient: s.gradient,
    courseId: certCourse?.id ?? series,
    completedSlugs: new Set<string>(completedLessonSlugs),
  });
  const streakDays = (await loadAchievementStats(user!.id).catch(() => null))?.streakDays ?? 0;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="print:hidden">
        <Header />
      </div>
      <main id="main" className="flex-1">
        <div className="max-w-[640px] mx-auto px-6 pt-10">
          {constellation ? (
            <CertificateCelebration
              seriesSlug={series}
              courseName={certificateCourseName(series, s.name)}
              constellation={constellation}
              streakDays={streakDays}
            />
          ) : null}
        </div>
        <Certificate
          recipientName={certificateRecipientName(user!)}
          courseName={certificateCourseName(series, s.name)}
          completedAt={formatCertDate(completedAtIso)}
          examScore={eligibility.examBest}
          totalLessons={eligibility.lessonsTotal}
          series={s.slug}
        />
      </main>
      <div className="print:hidden">
        <Footer />
      </div>
    </div>
  );
}
