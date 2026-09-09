import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PreviewFirstLesson from "@/components/Learn/PreviewFirstLesson";
import {
  getLearnMDXContent,
  getLessonsForSeries,
  getSeriesBySlug,
  stripMDXFrontmatter,
} from "@/lib/learn";
import { linkifySourceCitations } from "@/lib/mdx";
import { accessSeam, getAccessUserId, getCourseRowBySlug } from "@/lib/access";
import { buildPaywallView } from "@/lib/paywall";

interface Props {
  params: Promise<{ series: string }>;
}

/**
 * /learn/[series]/preview — preview-first-lesson route (ADR-221, THE fix).
 *
 * A dedicated read-only route that renders lesson 1's readable excerpt for a
 * `paywall`-decided user WITHOUT re-entering the paywall branch (breaking the
 * old infinite loop). A `granted`/`admin-preview` user is redirected to the
 * real lesson (they already have access). never statically prerendered — the
 * seam must evaluate per request.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { series } = await params;
  const s = getSeriesBySlug(series);
  const first = getLessonsForSeries(series)[0];
  return {
    title: `Preview: ${first?.title ?? s?.name ?? series} | Adroit`,
    description: first?.excerpt,
    robots: { index: false, follow: false },
  };
}

export default async function PreviewFirstLessonPage({ params }: Props) {
  const { series } = await params;

  const seriesInfo = getSeriesBySlug(series);
  if (!seriesInfo) notFound();

  // First published lesson — nothing to preview → 404.
  const lessons = getLessonsForSeries(series);
  const first = lessons[0];
  if (!first) notFound();

  // Access gate (the paywall-bypass): a granted/admin user gets the REAL
  // lesson; only a `paywall` user sees the preview variant.
  const userId = await getAccessUserId();
  const decision = await accessSeam.decideCourseAccess(userId, series);
  if (decision.kind === "not-launched") notFound();
  if (decision.kind === "granted" || decision.kind === "admin-preview") {
    redirect(`/learn/${series}/${first.slug}`);
  }

  // Load lesson-1 content (mirror the real lesson page).
  const mdxContent = getLearnMDXContent(series, first.slug);
  if (!mdxContent) notFound();
  const mdxBody = linkifySourceCitations(stripMDXFrontmatter(mdxContent));

  // Resolve the course + access options for the CTA target (reuses the same
  // buildPaywallView the Paywall uses — the CTA carries the exact options).
  const courseRow = await getCourseRowBySlug(series);
  if (!courseRow) notFound();
  const paywallView = buildPaywallView({
    course: courseRow,
    series: seriesInfo,
    peekLessonSlug: first.slug,
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <PreviewFirstLesson
        view={paywallView}
        lesson={first}
        mdx={mdxBody}
        seriesSlug={series}
        totalLessons={seriesInfo.totalLessons}
      />
      <Footer />
    </div>
  );
}
