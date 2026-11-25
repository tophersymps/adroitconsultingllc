/**
 * /atlas/[series]/cram - the exam cram sheet (server component).
 *
 * FREE AND PUBLIC BY DESIGN. This is a marketing surface for the course, so it
 * is deliberately NOT gated the way /exam and /certificate are: a reader without
 * an entitlement gets the sheet, not LockedContentPage. A 26-line
 * objective-to-rule sheet does not cannibalise a 61-lesson course, and this is
 * the page that earns links from study groups.
 *
 * The one gate that still applies is EXISTENCE. A course whose `courses` row is
 * not live must not leak its syllabus through this route, so the same ADR-201 /
 * R2-5 seam the other `/atlas` routes use is kept: `not-launched` 404s, and on a
 * token-route outage the page fails CLOSED on existence unless the series is in
 * the static mirror (CWE-200, t_c4eafa3b). Paywalled is the one verdict that
 * does NOT change the render, because the sheet is free.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Callout } from "@/components/MDX/Callout";
import { getSeriesBySlug } from "@/lib/learn";
import { getCramSheet, cramSheetSeries } from "@/lib/cram-sheets";
import { buildMetadata } from "@/lib/seo";
import { isDbTokenUnavailable } from "@/lib/db/degraded-client";
import { isPubliclyLaunchedSeries } from "@/lib/atlas-launch";
import { mayDiscloseSeriesLive } from "@/lib/atlas-disclosure";
import { accessSeam, getAccessUserId } from "@/lib/access";
import {
  CERT_EXAM_MINUTES,
  CERT_EXAM_PASS_PCT,
} from "@/lib/exam-config";

interface Props {
  params: Promise<{ series: string }>;
}

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return cramSheetSeries().map((series) => ({ series }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { series } = await params;
  const sheet = getCramSheet(series);
  const s = getSeriesBySlug(series);
  if (!sheet || !s) return {};
  // Metadata runs BEFORE the page's notFound(), so an unpublished series must
  // never name itself in the 404 head. Same disclosure authority as
  // /atlas/[series]: the DB decides while readable, the static mirror on an
  // outage. A launched course's sheet is indexable.
  if (!(await mayDiscloseSeriesLive(series))) {
    return buildMetadata({
      title: "Exam cram sheet | Adroit Learn",
      description: "Objective-by-objective revision sheets for Adroit Learn courses.",
      path: `/atlas/${series}/cram`,
      noindex: true,
    });
  }
  return buildMetadata({
    title: `${sheet.title} exam cram sheet | Adroit Learn`,
    description: `Every objective on the ${sheet.title} blueprint, each with the deciding rule and the trap the exam prices.`,
    path: `/atlas/${series}/cram`,
  });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card-soft)] px-4 py-3">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-extrabold text-[var(--ink-strong)]">{value}</p>
    </div>
  );
}

export default async function CramPage({ params }: Props) {
  const { series } = await params;
  const s = getSeriesBySlug(series);
  if (!s) notFound();

  const sheet = getCramSheet(series);
  if (!sheet) notFound();

  // Existence gate only. The sheet is free, so `paywall` renders normally.
  const userId = await getAccessUserId();
  let decision: Awaited<ReturnType<typeof accessSeam.decideCourseAccess>> | null = null;
  let degraded = false;
  try {
    decision = await accessSeam.decideCourseAccess(userId, series);
  } catch (err) {
    if (!isDbTokenUnavailable(err)) throw err;
    degraded = true;
  }
  if (decision?.kind === "not-launched") notFound();
  if (degraded && !isPubliclyLaunchedSeries(series)) notFound();

  const domains = sheet.domains;
  const byDomain = domains.map((d) => ({
    ...d,
    objectives: sheet.objectives.filter((o) => o.domain === d.domain),
  }));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-[860px] px-6 pb-20 pt-10">
        <p className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
          Exam cram sheet
        </p>
        <h1 className="mt-3 text-[clamp(1.7rem,3.4vw,2.4rem)] font-extrabold leading-tight tracking-[-0.02em] text-[var(--ink-strong)]">
          {sheet.title}
        </h1>
        <p className="mt-3 max-w-[62ch] text-[var(--ink-muted)]">
          Every objective on the blueprint, each with the deciding rule and the trap the exam
          prices. {" "}
          <Link href={`/atlas/${series}`} className="font-semibold text-[var(--accent)] underline">
            Take the full course
          </Link>{" "}
          for the teaching behind each line.
        </p>

        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Questions" value={String(sheet.examFacts.scoredQuestions)} />
          <Stat label="Minutes" value={String(CERT_EXAM_MINUTES)} />
          <Stat label="Pass mark" value={`${CERT_EXAM_PASS_PCT}%`} />
          <Stat label="Release" value={sheet.examFacts.versionLabel} />
        </div>
        <p className="mt-3 text-sm text-[var(--ink-muted)]">
          Up to {sheet.examFacts.unscoredUpTo} unscored questions are mixed in at random and do not
          affect your result, so answer every question as though it counts.
        </p>

        <div className="article-body mt-10">
          <h2>How the exam is weighted</h2>
          <table>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Share of the exam</th>
                <th>Questions drawn</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.domain}>
                  <td>{d.domain}</td>
                  <td>{d.weightPct}%</td>
                  <td>{d.examDraw}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {byDomain.map((d) => (
            <section key={d.domain}>
              <h2>
                {d.domain} ({d.weightPct}%)
              </h2>
              {d.objectives.map((o) => (
                <section key={o.id}>
                  <h3>{o.objective}</h3>
                  <ul>
                    {o.rules.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  <Callout kind="warning">{o.trap}</Callout>
                </section>
              ))}
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
