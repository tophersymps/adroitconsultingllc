import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LessonProgress from "@/components/Learn/LessonProgress";
import EmptyState from "@/components/Learn/EmptyState";
import SeriesSyllabus from "@/components/Learn/SeriesSyllabus";
import { learnSeries } from "@/data/learn";
import {
  getLessonsForSeries,
  getSeriesBySlug,
  getSeriesProgress,
  seriesShortLabel,
} from "@/lib/learn";
import { buildMetadata, siteConfig } from "@/lib/seo";
import SeriesProgress from "@/components/Progress/SeriesProgress";
import QuizStats from "@/components/Progress/QuizStats";
import CertReadiness from "@/components/Progress/CertReadiness";
import CheckCardList from "@/components/Progress/CheckCardList";
import ExamCard from "@/components/Progress/ExamCard";
import { getKnowledgeChecks } from "@/lib/quiz";
import { accessSeam, getAccessUserId, getCourseRowBySlug } from "@/lib/access";
import { getCatalogForUserV2, prerequisitesMet } from "@/lib/catalog";
import { getCompletedCourseIds, getCompletedLessonSlugs } from "@/lib/completion";
import { StatusBadge } from "@/components/Catalog/StatusBadge";
import { AccessModelChip } from "@/components/Catalog/AccessModelChip";
import DifficultyPill from "@/components/Learn/DifficultyPill";
import PrerequisitesSection from "@/components/Learn/PrerequisitesSection";
import SeriesStarChart from "@/components/Constellations/chart/SeriesStarChart";
import { loadSeriesConstellation, loadExamPassedBySeries } from "@/lib/sky-server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ series: string }>;
}

/**
 * This page resolves the signed-in user's access decision from the request's
 * HttpOnly session cookie + Supabase (ADR-201). Those inputs only exist at
 * request time, so the page MUST render dynamically — a static prerender
 * would bake a guest/no-access snapshot into HTML and serve it to everyone.
 * force-dynamic also prevents the build from executing the Supabase access
 * seam at build time (env absent in CI).
 */
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return learnSeries.map((s) => ({ series: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { series } = await params;
  const s = getSeriesBySlug(series);
  if (!s) return {};
  return buildMetadata({
    title: `${s.name} | Adroit Learn`,
    description: s.description,
    path: `/learn/${series}`,
  });
}

export default async function SeriesPage({ params }: Props) {
  const { series } = await params;
  const s = getSeriesBySlug(series);
  if (!s) notFound();

  // Access seam gate (ADR-201): DB-backed status. not-launched (no courses row,
  // or non-live + non-admin) → 404. The syllabus stays readable on a live course
  // even when the member isn't entitled (US-004) — content-tier links gate via
  // the lesson page seam.
  const userId = await getAccessUserId();
  const decision = await accessSeam.decideCourseAccess(userId, series);
  if (decision.kind === "not-launched") notFound();
  const courseRow = await getCourseRowBySlug(series);

  // Learn v2 profile (ADR-208/209/210): the unified CatalogCourse for this
  // series — section/group, difficulty/audience/outcomes/tags, structured
  // prerequisites, and the derived next-course seam. Best-effort: profile
  // extras degrade gracefully if org rows aren't present.
  let catalogCourse: Awaited<
    ReturnType<typeof getCatalogForUserV2>
  >["courses"][number] | null = null;
  let nextCourse: { nextCourseId: string | null; prerequisitesMet: boolean } | null =
    null;
  try {
    const catalog = await getCatalogForUserV2(userId);
    catalogCourse =
      catalog.courses.find((c) => c.course.series_slug === series) ?? null;
    if (catalogCourse && catalogCourse.prerequisites.length > 0) {
      const completedIds = await getCompletedCourseIds(userId ?? "");
      const idBySeries = new Map(
        catalog.courses.map((c) => [c.course.series_slug, c.course.id]),
      );
      const requiredIds = catalogCourse.prerequisites
        .map((p) => idBySeries.get(p.series_slug))
        .filter((id): id is string => Boolean(id));
      nextCourse = {
        nextCourseId: catalogCourse.nextCourseId,
        prerequisitesMet: prerequisitesMet(requiredIds, completedIds),
      };
    }
  } catch {
    // profile stays null — outline still renders content-driven basics
  }

  // Lesson-number ordering (ADR-105) — the syllabus client re-sorts on
  // toggle; the server always passes the canonical asc order.
  const baseLessons = getLessonsForSeries(series);
  const { published, total, curriculum } = getSeriesProgress(s);
  // Lessons the publisher still owes (curriculumLessons - published). This is
  // the "coming soon" count — totalLessons == highest published, so the old
  // total - published was ~0 and hid the real gap.
  const upcoming = Math.max(0, curriculum - published);

  // Tier presence (ADR-101): omni-studio-cert ships checks + exam; non-tier
  // series (sfarch, agentic) keep the legacy quiz behaviour.
  const checksMeta = getKnowledgeChecks(series);
  const hasTiers = checksMeta.length > 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LearningPath",
    name: s.name,
    description: s.description,
    url: `${siteConfig.url}/learn/${series}`,
    hasPart: {
      "@type": "ItemList",
      itemListElement: baseLessons.map((l, i) => ({
        "@type": "ListItem",
        position: i + 1,
        // lesson.title already carries the "Lesson N:" prefix (t_fa2f15c7)
        name: l.title,
        url: `${siteConfig.url}/learn/${series}/${l.slug}`,
      })),
    },
  };

  // Constellation + Chronicle (B-18): the series' planned star field beside
  // the syllabus. Authed users see per-lesson progress (lit/locked from their
  // current completion rows — single source of truth lesson_completion, shared
  // with the profile sky via getCompletedLessonSlugs, so a mark OR unmark
  // reflects on both surfaces); guests see the locked/available shape.
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthed = Boolean(user);
  const completedSlugs = isAuthed
    ? await getCompletedLessonSlugs(user!.id)
    : new Set<string>();
  const examPassed = isAuthed
    ? (await loadExamPassedBySeries(user!.id, [series])).has(series)
    : false;
  const constellation = await loadSeriesConstellation({
    seriesSlug: series,
    name: s.name,
    gradient: s.gradient,
    courseId: courseRow?.id ?? series,
    completedSlugs,
    examPassed,
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main id="main" className="flex-1">
        {/* Series header strip */}
        <div className="max-w-[1120px] mx-auto px-6 pt-14">
          <Link
            href="/learn"
            className="inline-flex items-center gap-1.5 text-gray-500 text-xs font-medium no-underline mb-6 hover:text-navy transition-colors duration-150"
          >
            &larr; Back to Learn
          </Link>

          <div
            className={`rounded-2xl overflow-hidden relative bg-gradient-to-br ${s.gradient} p-8 pb-7 shadow-lg shadow-navy/10`}
          >
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 85% 15%, rgba(255,255,255,0.22) 0%, transparent 45%)",
              }}
            />
            <span className="relative inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-white uppercase tracking-[0.07em] bg-black/55 backdrop-blur-sm px-[11px] py-1 rounded-full mb-3.5">
              {seriesShortLabel(s.slug)}
            </span>
            {/* DB-backed status + access model (platform source of truth) */}
            {courseRow && (
              <span className="relative mb-3.5 ml-1.5 inline-flex items-center gap-2">
                <StatusBadge status={courseRow.status} />
                <AccessModelChip model={courseRow.access_model} />
              </span>
            )}
            <h1 className="relative text-[clamp(1.5rem,3vw,2rem)] font-extrabold text-white tracking-[-0.02em] mb-2 leading-tight">
              {s.name}
            </h1>
            <p className="relative text-white text-sm max-w-[560px] leading-relaxed mb-5 bg-black/55 backdrop-blur-sm rounded-xl px-4 py-3">
              {s.description}
            </p>
            {/* Learn v2 profile chips (ADR-208): difficulty + audience on the band. */}
            {(catalogCourse?.course.difficulty || catalogCourse?.course.audience) && (
              <div className="relative flex flex-wrap items-center gap-2 mb-5">
                <DifficultyPill
                  difficulty={catalogCourse?.course.difficulty ?? null}
                  onGradient
                />
                {catalogCourse?.course.audience && (
                  <span className="inline-flex items-center font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] px-2.5 py-1 rounded-full border text-white bg-black/55 border-white/25 backdrop-blur-sm">
                    {catalogCourse.course.audience}
                  </span>
                )}
              </div>
            )}
            {total > 0 && (
              <div className="relative max-w-[420px]">
                <LessonProgress
                  published={published}
                  total={total}
                  onGradient
                />
                {/* Real user completion progress */}
                <div className="mt-3">
                  <SeriesProgress
                    lessonSlugs={baseLessons.map((l) => l.slug)}
                    showPercent
                  />
                </div>
                {/* Tier-aware readiness rollup (tier series) or legacy quiz stats */}
                {hasTiers ? (
                  <CertReadiness series={series} onGradient />
                ) : (
                  <div className="mt-2.5">
                    <QuizStats seriesSlug={series} onGradient />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Learn v2 profile (ADR-208/209): outcomes, tags, prerequisites + next-course */}
        {(catalogCourse &&
          (catalogCourse.course.learning_outcomes?.length ||
            catalogCourse.course.course_tags?.length ||
            catalogCourse.prerequisites.length ||
            catalogCourse.course.recommended_background)) && (
          <div className="max-w-[1120px] mx-auto px-6 pt-8 pb-2">
            <div className="grid gap-6 md:grid-cols-2">
              {catalogCourse.course.learning_outcomes?.length ? (
                <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card-soft)] p-6">
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="w-[3px] h-4 rounded-sm bg-[var(--accent)]" aria-hidden />
                    <h2 className="font-mono text-[12px] font-bold text-[var(--ink-faint)] uppercase tracking-[0.1em]">
                      What you&apos;ll learn
                    </h2>
                  </div>
                  <ul className="space-y-2">
                    {catalogCourse.course.learning_outcomes.map((o, i) => (
                      <li
                        key={i}
                        className="flex gap-2.5 text-[13.5px] text-[var(--ink-muted)] leading-relaxed"
                      >
                        <span aria-hidden className="text-[var(--accent)] mt-0.5">
                          ✓
                        </span>
                        {o}
                      </li>
                    ))}
                  </ul>
                  {catalogCourse.course.course_tags?.length ? (
                    <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-[var(--border-subtle)]">
                      {catalogCourse.course.course_tags.map((t) => (
                        <span
                          key={t}
                          className="font-mono text-[10.5px] font-bold text-[var(--accent-on-tint)] bg-[var(--accent)]/[0.08] px-2.5 py-1 rounded-full uppercase tracking-[0.05em]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                catalogCourse.course.course_tags?.length ? (
                  <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card-soft)] p-6">
                    <div className="flex flex-wrap gap-1.5">
                      {catalogCourse.course.course_tags.map((t) => (
                        <span
                          key={t}
                          className="font-mono text-[10.5px] font-bold text-[var(--accent-on-tint)] bg-[var(--accent)]/[0.08] px-2.5 py-1 rounded-full uppercase tracking-[0.05em]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null
              )}
              <PrerequisitesSection
                prerequisites={catalogCourse.prerequisites}
                recommendedBackground={
                  catalogCourse.course.recommended_background
                }
                nextCourse={nextCourse}
              />
            </div>
          </div>
        )}

        {/* On-course tracker — the course drawn as its constellation, star
            lines lit to match progress (Hubble Field Phase 2). SVG, so there
            is no WebGL gate and no 2D fallback to keep in step. The chart
            centres its own wide band (max-width 1200px) with the galaxy
            filling the frame, inside the syllabus's content shell. */}
        <div className="max-w-[1120px] mx-auto px-6 pt-8">
          {constellation ? (
            <div className="mb-10">
              <SeriesStarChart
                constellation={constellation}
                isGuest={!isAuthed}
              />
            </div>
          ) : null}
        </div>

        {/* Syllabus — lesson-number order (ADR-105), client sort + hide-completed. */}
        <div className="max-w-[1120px] mx-auto px-6 py-8 pb-4">
          {baseLessons.length > 0 ? (
            <div className="grid gap-10 grid-cols-[minmax(0,1fr)]">
              <Suspense fallback={null}>
                <SeriesSyllabus
                  lessons={baseLessons}
                  totalLessons={total}
                  published={published}
                  upcoming={upcoming}
                />
              </Suspense>
            </div>
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Tier sections — checks + exam card (only for tiered courses) */}
        {hasTiers && (
          <>
            <CheckCardList series={series} checksMeta={checksMeta} />
            <ExamCard series={series} totalChecks={checksMeta.length} />
          </>
        )}

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </main>

      <Footer />
    </div>
  );
}
