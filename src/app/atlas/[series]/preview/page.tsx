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
import {
  buildDegradedPaywallView,
  buildPaywallView,
} from "@/lib/paywall";
import { isDbTokenUnavailable } from "@/lib/db/degraded-client";
import { isPubliclyLaunchedSeries } from "@/lib/atlas-launch";
import type { PaywallView } from "@/shared/contracts-course-catalog";

interface Props {
  params: Promise<{ series: string }>;
}

/**
 * /atlas/[series]/preview — preview-first-lesson route (ADR-221, THE fix).
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
  // LOW (t_91a3e30b, CWE-200): generateMetadata runs BEFORE the page's
  // notFound(), so an unpublished ("stealth") series used to name itself in the
  // 404 document head. Only a publicly launched series may appear there.
  if (!isPubliclyLaunchedSeries(series)) {
    return {
      title: "Preview | Adroit Learn",
      robots: { index: false, follow: false },
    };
  }
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
  //
  // R2-5 (t_91a3e30b MEDIUM): a token-route failure used to escape this route
  // as an unhandled 500 — `/atlas/<live>/preview` 500d while
  // `/atlas/<unknown>/preview` 404d, a status-code oracle for unpublished
  // series. Degrade instead: the seam failure is classified, everything else
  // still propagates.
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
  // F-2 (MEDIUM, CWE-200): the degraded path cannot prove the series is
  // publicly launched — the static catalogue also carries stealth slugs — so
  // fail CLOSED on EXISTENCE, before any content read.
  if (degraded && !isPubliclyLaunchedSeries(series)) notFound();
  if (decision?.kind === "not-launched") notFound();
  if (decision?.kind === "granted" || decision?.kind === "admin-preview") {
    redirect(`/atlas/${series}/${first.slug}`);
  }

  // When the access decision is unknown we must NOT serve the lesson body: the
  // preview shell (lesson meta + locked seam + unlock CTA) renders at 200 with
  // no MDX and no DB course read, matching the sibling routes' degrade.
  let mdxBody = "";
  let paywallView: PaywallView;
  if (degraded) {
    paywallView = buildDegradedPaywallView(seriesInfo, first.slug);
  } else {
    // Load lesson-1 content (mirror the real lesson page).
    const mdxContent = getLearnMDXContent(series, first.slug);
    if (!mdxContent) notFound();
    mdxBody = linkifySourceCitations(stripMDXFrontmatter(mdxContent));

    // Resolve the course + access options for the CTA target (reuses the same
    // buildPaywallView the Paywall uses — the CTA carries the exact options).
    const courseRow = await getCourseRowBySlug(series);
    if (!courseRow) notFound();
    paywallView = buildPaywallView({
      course: courseRow,
      series: seriesInfo,
      peekLessonSlug: first.slug,
    });
  }

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
