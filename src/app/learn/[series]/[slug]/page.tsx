import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ReadingProgress from "@/components/BlogPost/ReadingProgress";
import ShareBar from "@/components/BlogPost/ShareBar";
import LessonNavigation from "@/components/Learn/LessonNavigation";
import { learnSeries } from "@/data/learn";
import {
  getAuthorInitials,
  getLearnMDXContent,
  getLesson,
  getLessonsForSeries,
  getSeriesBySlug,
  stripMDXFrontmatter,
  toIsoDate,
} from "@/lib/learn";
import { linkifySourceCitations } from "@/lib/mdx";
import { buildMetadata, siteConfig } from "@/lib/seo";
import MarkComplete from "@/components/Progress/MarkComplete";
import LessonCompleteProgress from "@/components/Progress/LessonCompleteProgress";
import LessonQuiz from "@/components/Progress/LessonQuiz";
import GuestCTA from "@/components/Progress/GuestCTA";
import { getQuizForLesson } from "@/lib/quiz";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import MDXArticle from "@/components/MDX/MDXArticle";
import Paywall from "@/components/Catalog/Paywall";
import { accessSeam, getAccessUserId, getCourseRowBySlug } from "@/lib/access";
import { buildPaywallView } from "@/lib/paywall";
import { loadSeriesConstellation } from "@/lib/sky-server";
import LessonCelebration from "@/components/Constellations/LessonCelebration";
import type { ConstellationState } from "@/shared/contracts-constellations";

interface Props {
  params: Promise<{ series: string; slug: string }>;
}

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return learnSeries.flatMap((s) =>
    s.lessons.map((l) => ({ series: s.slug, slug: l.slug })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { series, slug } = await params;
  const lesson = getLesson(series, slug);
  if (!lesson) return {};
  const s = getSeriesBySlug(series);
  return buildMetadata({
    // lesson.title already carries the "Lesson N:" prefix — do NOT re-prefix
    // (t_fa2f15c7 HIGH: previously rendered "Lesson 1: Lesson 1: ...").
    title: `${lesson.title} | ${s?.name ?? series} | Adroit`,
    description: lesson.excerpt,
    path: `/learn/${series}/${slug}`,
    publishedTime: toIsoDate(lesson.date),
    tags: lesson.tags,
  });
}

export default async function LessonPage({ params }: Props) {
  const { series, slug } = await params;
  const lesson = getLesson(series, slug);
  if (!lesson) notFound();
  const seriesInfo = getSeriesBySlug(series);
  if (!seriesInfo) notFound();

  // Load and compile MDX content from content/learn/<series>/[slug].mdx
  // (frontmatter stripped — the blog renderer's raw-pass-through bug is not
  // replicated for Learn; see lib/learn.ts stripMDXFrontmatter)
  const mdxContent = getLearnMDXContent(series, slug);
  if (!mdxContent) notFound();
  const mdxBody = linkifySourceCitations(stripMDXFrontmatter(mdxContent));

  const lessons = getLessonsForSeries(series);

  // Access seam gate (ADR-201) — DB-backed status + entitlements. not-launched
  // → 404; paywall → render the Paywall instead of content (AC-3).
  const userId = await getAccessUserId();
  const decision = await accessSeam.decideCourseAccess(userId, series);
  if (decision.kind === "not-launched") notFound();

  // Server-side session gate (ADR-104): guests NEVER receive question text —
  // the quiz JSON is loaded only in the authed branch.
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthed = Boolean(user);
  const lessonQuiz = isAuthed ? getQuizForLesson(series, slug) : null;

  // Paywall branch — live + not entitled. Server-rendered with the course's
  // real access options + first published lesson as the peek.
  if (decision.kind === "paywall") {
    const courseRow = await getCourseRowBySlug(series);
    const peekLessonSlug = lessons[0]?.slug ?? null;
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main id="main" className="flex-1">
          {courseRow ? (
            <Paywall
              seriesSlug={series}
              view={buildPaywallView({
                course: courseRow,
                series: seriesInfo,
                peekLessonSlug,
              })}
            />
          ) : (
            notFound()
          )}
        </main>
        <Footer />
      </div>
    );
  }

  // Constellation + Chronicle (B-18): the series' planned star field for the
  // lesson-complete celebration. Authed users only — guests get no persistent
  // completion state, so no celebration. The celebration's lit-count is the
  // post-write value (current lesson counted) so the pop reads correctly the
  // moment the user marks complete.
  let constellationState: ConstellationState | null = null;
  if (isAuthed) {
    const completedRows = await supabase
      .from("lesson_completion")
      .select("lesson_slug")
      .eq("user_id", user!.id);
    const completed = new Set(
      (completedRows.data ?? []).map((r) => r.lesson_slug as string),
    );
    completed.add(slug); // this lesson just completed in the client flow
    constellationState = await loadSeriesConstellation({
      seriesSlug: series,
      name: seriesInfo.name,
      gradient: seriesInfo.gradient,
      courseId: (await getCourseRowBySlug(series))?.id ?? series,
      completedSlugs: completed,
    });
  }


  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: lesson.title,
    description: lesson.excerpt,
    datePublished: toIsoDate(lesson.date),
    author: { "@type": "Organization", name: lesson.author },
    url: `${siteConfig.url}/learn/${series}/${slug}`,
    isPartOf: {
      "@type": "LearningPath",
      name: seriesInfo.name,
      url: `${siteConfig.url}/learn/${series}`,
    },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <ReadingProgress />
      <Header />

      <main id="main" className="flex-1">
        {/* Lesson hero */}
        <div className="max-w-[720px] mx-auto px-6 pt-10 pb-0">
          <Link
            href={`/learn/${series}`}
            className="inline-flex items-center gap-1.5 text-gray-500 text-xs font-medium no-underline mb-5 hover:text-navy transition-colors duration-150"
          >
            &larr; Back to {seriesInfo.name}
          </Link>

          {/* Series crumb — mono sequence voice */}
          <div className="flex items-center gap-2 font-mono text-[11.5px] font-semibold text-gray-500 mb-[18px]">
            <span className="bg-navy text-white px-2 py-0.5 rounded-[5px] font-bold">
              Lesson {lesson.lesson}
            </span>
            <span>
              of {seriesInfo.totalLessons} &middot;{" "}
              <Link
                href={`/learn/${series}`}
                className="text-gray-500 no-underline hover:text-navy transition-colors duration-150"
              >
                {seriesInfo.name}
              </Link>
            </span>
          </div>

          <h1 className="text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold text-navy tracking-[-0.02em] leading-tight mb-5">
            {lesson.title}
          </h1>

          {/* Author row */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-navy to-navy-light ring-2 ring-white shadow-sm flex items-center justify-center text-white font-bold text-xs">
              {getAuthorInitials(lesson.author)}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-800">
                {lesson.author}
              </span>
              <div className="flex items-center text-xs text-gray-500">
                <span>{lesson.date}</span>
                <span className="mx-3 h-3 w-px bg-gray-200" />
                <span>{lesson.readTime}</span>
              </div>
            </div>
          </div>

          {/* Tags */}
          {lesson.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {lesson.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <ShareBar />

          {/* Lesson completion progress */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <LessonCompleteProgress lessonSlug={lesson.slug} />
            <div className="mt-3">
              <MarkComplete lessonSlug={lesson.slug} label={`lesson ${lesson.slug}`} />
            </div>
          </div>
        </div>

        {/* Article Body — rendered from MDX content */}
        <article className="article-body max-w-[720px] mx-auto px-6 pb-16">
          <MDXArticle mdx={mdxBody} kind="learn" />

          {/* Gated Practice Questions section — guests get the CTA placeholder,
              authed users get the interactive LessonQuiz; authed with no
              questions file renders nothing (copy deck §1). */}
          {!isAuthed ? (
            <GuestCTA tier="lesson" ariaLabel="Practice questions locked" />
          ) : lessonQuiz ? (
            <LessonQuiz
              quizName={lessonQuiz.quizName}
              lessonNumber={lesson.lesson}
              lessonSlug={lesson.slug}
              questions={lessonQuiz.questions}
              backHref={`/learn/${series}/${slug}`}
            />
          ) : null}
        </article>

        {/* Prev/Next within series (authored sequence) */}
        <LessonNavigation lessons={lessons} currentSlug={slug} />

        {/* Constellation + Chronicle (B-18): star-ignition celebration on
            lesson completion. Authed only (guests have no persistent
            completion state). Mounted regardless of scroll so the pop fires
            the moment the user marks the lesson complete. */}
        {isAuthed && constellationState ? (
          <LessonCelebration
            seriesSlug={series}
            courseName={seriesInfo.name}
            lessonSlug={slug}
            lessonLabel={lesson.title}
            litStars={constellationState.litStars}
            totalStars={constellationState.totalStars}
            courseJustCompleted={constellationState.complete}
          />
        ) : null}

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </main>

      <Footer />
    </div>
  );
}
