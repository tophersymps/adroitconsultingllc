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
  stripLessonTitleH1,
  toIsoDate,
} from "@/lib/learn";
import { linkifySourceCitations } from "@/lib/mdx";
import { buildMetadata, siteConfig } from "@/lib/seo";
import MarkComplete from "@/components/Progress/MarkComplete";
import MarkCompleteCompact from "@/components/Progress/MarkCompleteCompact";
import LessonCompleteProgress from "@/components/Progress/LessonCompleteProgress";
import LessonQuiz from "@/components/Progress/LessonQuiz";
import GuestCTA from "@/components/Progress/GuestCTA";
import { getQuizForLesson, getKnowledgeChecks } from "@/lib/quiz";
import { checkEndingAt, nextLessonAfter } from "@/lib/lesson-checks";
import { loadCheckScore } from "@/lib/check-scores";
import MilestonePanel from "@/components/Learn/MilestonePanel";
import { getSupabaseServerClient } from "@/lib/db/server";
import { isDbTokenUnavailable } from "@/lib/db/degraded-client";
import { isPubliclyLaunchedSeries } from "@/lib/atlas-launch";
import { mayDiscloseSeriesLive } from "@/lib/atlas-disclosure";
import MDXArticle from "@/components/MDX/MDXArticle";
import MDXSources from "@/components/MDX/MDXSources";
import { hasFootnoteDefinitions } from "@/lib/lesson-sources";
import Paywall from "@/components/Catalog/Paywall";
import { AudioPlayerLazy } from "@/components/BlogPost/AudioPlayerLazy";
import { lessonAudio } from "@/data/lesson-audio";
import { accessSeam, getAccessUserId, getCourseRowBySlug } from "@/lib/access";
import {
  buildDegradedPaywallView,
  buildPaywallView,
} from "@/lib/paywall";
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
  // LOW (t_91a3e30b, CWE-200): generateMetadata runs BEFORE notFound(), so a
  // stealth series' lesson title/excerpt used to leak into the 404 head. Only
  // a publicly launched series may appear here.
  //
  // MEDIUM (t_b4c0da5f, CWE-200): mirror membership is not enough — a series
  // kept in the mirror but delisted in `courses` (pending/archived) 404s on the
  // DB seam while this head still named its lesson. Two-source rule via
  // `mayDiscloseSeries`: mirror AND (DB unreadable OR DB live). `null` from a
  // credential outage falls back to the mirror (no regression of t_91a3e30b).
  // `getCourseRowBySlug` is per-request cached, so a paywall-body read is shared.
  if (!(await mayDiscloseSeriesLive(series))) {
    return buildMetadata({
      title: "Atlas | Adroit Learn",
      description: "Course catalogue for Salesforce and AI practitioners.",
      path: `/atlas/${series}/${slug}`,
      noindex: true,
    });
  }
  const s = getSeriesBySlug(series);
  return buildMetadata({
    // lesson.title already carries the "Lesson N:" prefix — do NOT re-prefix
    // (t_fa2f15c7 HIGH: previously rendered "Lesson 1: Lesson 1: ...").
    title: `${lesson.title} | ${s?.name ?? series} | Adroit`,
    description: lesson.excerpt,
    path: `/atlas/${series}/${slug}`,
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
  const mdxBody = linkifySourceCitations(
    stripLessonTitleH1(stripMDXFrontmatter(mdxContent)),
  );

  const lessons = getLessonsForSeries(series);

  // A narrated entry for this lesson, resolved from the static (build-time)
  // generated module - gated on (series, slug) because the same lesson slug can
  // appear in multiple series (ADR-102). No player when no audio entry.
  const audio = lessonAudio.find(
    (a) => a.series === series && a.slug === slug,
  );

  // Access seam gate (ADR-201) — DB-backed status + entitlements. not-launched
  // → 404; paywall → render the Paywall instead of content (AC-3).
  // R2-5: a token-route failure degrades to the GUEST/paywall view (static
  // series data only) — never 404, never a quiz payload.
  const userId = await getAccessUserId();
  let decision: Awaited<ReturnType<typeof accessSeam.decideCourseAccess>> | null =
    null;
  let degraded = false;
  try {
    decision = await accessSeam.decideCourseAccess(userId, series);
  } catch (err) {
    if (!isDbTokenUnavailable(err)) throw err;
    degraded = true;
  }
  // F-2 (t_c4eafa3b MEDIUM, CWE-200): the degraded path cannot prove the
  // series is publicly launched — the static catalogue also carries stealth
  // slugs — so fail CLOSED on EXISTENCE. An unpublished series 404s during an
  // outage exactly as the healthy seam does. Availability for the four seeded
  // live series is unchanged (R2-5).
  if (degraded && !isPubliclyLaunchedSeries(series)) notFound();
  if (decision?.kind === "not-launched") notFound();

  // Server-side session gate (ADR-104): guests NEVER receive question text —
  // the quiz JSON is loaded only in the authed branch.
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthed = Boolean(user);
  const lessonQuiz = isAuthed ? getQuizForLesson(series, slug) : null;

  // Paywall branch — live + not entitled. Server-rendered with the course's
  // real access options + first published lesson as the peek.
  // R2-5: a token-route failure lands here too (guest/paywall view at 200).
  if (degraded || decision?.kind === "paywall") {
    const courseRow = degraded ? null : await getCourseRowBySlug(series);
    const peekLessonSlug = lessons[0]?.slug ?? null;
    const view = courseRow
      ? buildPaywallView({ course: courseRow, series: seriesInfo, peekLessonSlug })
      : buildDegradedPaywallView(seriesInfo, peekLessonSlug);
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main id="main" className="flex-1">
          <Paywall seriesSlug={series} view={view} degraded={degraded} />
        </main>
        <Footer />
      </div>
    );
  }

  // Milestone routing (A6, architecture.md §3.2 "Routing into the check").
  //
  // When this lesson ends a knowledge check's range, Next and the milestone
  // panel point INTO the check until it is passed. The verdict is the
  // authoritative server-graded `quiz_attempt` read the exam gate uses
  // (`lib/check-scores.ts`): one query here, shared by the panel and the
  // navigation, so the two can never disagree (US-008 — no second fetch).
  //
  // Guests: no query and no pass state. They get `passed: false`, which only
  // decides a destination — there is no gate, no `blocked`/`mode` prop and no
  // locked branch anywhere here. This lesson always renders, and so does the
  // next one, whether or not the check is passed (architecture.md §4).
  const checks = getKnowledgeChecks(series);
  const milestone = checkEndingAt(checks, lesson.lesson);
  const milestoneNextLesson = milestone
    ? nextLessonAfter(lessons, lesson.lesson)
    : undefined;
  const milestonePassed =
    milestone && isAuthed
      ? (await loadCheckScore(supabase, user!.id, series, milestone.n)).passed
      : false;

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
    url: `${siteConfig.url}/atlas/${series}/${slug}`,
    isPartOf: {
      "@type": "LearningPath",
      name: seriesInfo.name,
      url: `${siteConfig.url}/atlas/${series}`,
    },
  };

  return (
    <div
      className={`min-h-screen flex flex-col lesson-page${
        audio ? " lesson-page--has-audio" : ""
      }`}
    >
      <ReadingProgress />
      <Header />

      <main id="main" className="flex-1">
        {/* Lesson hero */}
        <div className="max-w-[720px] mx-auto px-6 pt-10 pb-0">
          <Link
            href={`/atlas/${series}`}
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
                href={`/atlas/${series}`}
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

        {/* Lesson audio - auth-gated player (locked card for logged-out).
            Gated on `audio` so the AudioPlayer client JS chunk + its useAuth()
            session fetch are NOT shipped/run on lessons without a narration.
            Mirrors the article page's sticky placement (sticky top-16 z-40,
            docked just below the site header). The lesson slug is unique
            across the catalogue, so the player fetches /api/audio/<slug>. */}
        {audio && (
          <div className="sticky top-16 z-40 max-w-[920px] mx-auto px-6 my-6">
            <AudioPlayerLazy
              slug={slug}
              hasAudio
              label="lesson"
              trailing={<MarkCompleteCompact lessonSlug={slug} label={`lesson ${slug}`} />}
            />
          </div>
        )}

        {/* Article Body — rendered from MDX content.
            The body render drops the GFM footnotes section (`sources="split"`)
            so the citations can be composed as the page's LAST content block,
            after the practice/check block (K3 spec §1). Both renders compile
            the same source, so footnote numbering and back-reference ids stay
            in agreement; the section is rendered exactly once, by MDXSources. */}
        <article className="article-body max-w-[720px] mx-auto px-6 pb-16">
          <MDXArticle mdx={mdxBody} sources="split" />

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
              backHref={`/atlas/${series}/${slug}`}
            />
          ) : null}

          {/* Milestone panel — only on a lesson that ENDS a check's range.
              Between the practice questions and the sources (the sources block
              lands here with A2). Server-rendered on first paint, additive: it
              never replaces the lesson body and never gates the next lesson. */}
          {milestone ? (
            <MilestonePanel
              series={series}
              check={milestone}
              nextLesson={milestoneNextLesson}
              passed={milestonePassed}
            />
          ) : null}

          {/* SOURCES — appendix, last content block on the page. Rendered only
              when the document declares footnote definitions; MDXSources
              additionally returns null when definitions exist but no
              reference emits a section (no empty "Sources" heading). */}
          {hasFootnoteDefinitions(mdxBody) ? <MDXSources mdx={mdxBody} /> : null}
        </article>

        {/* Prev/Next within series (authored sequence). On a range-end lesson
            the "next" slot routes into the check until it is passed. */}
        <LessonNavigation
          lessons={lessons}
          currentSlug={slug}
          nextOverride={
            milestone && !milestonePassed
              ? {
                  href: `/atlas/${series}/check/${milestone.n}`,
                  label: `Knowledge Check ${milestone.n}`,
                  sublabel: `Lessons ${milestone.lessons[0]}–${milestone.lessons[1]}`,
                }
              : undefined
          }
        />

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
