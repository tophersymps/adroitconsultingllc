import Link from "next/link";
import { StatusBadge } from "@/components/Catalog/StatusBadge";
import { AccessModelChip } from "@/components/Catalog/AccessModelChip";
import { seriesShortLabel } from "@/lib/learn";
import type { CourseRow } from "@/shared/contracts-course-catalog";

interface CourseComingSoonProps {
  /** The series' display identity (name, description, gradient). */
  series: {
    name: string;
    description: string;
    gradient: string;
    slug: string;
  };
  /** The DB course row — carries status + access_model for the chips. */
  courseRow: CourseRow;
  /** Number of lessons still owed (curriculum - published). */
  upcoming: number;
}

/**
 * CourseComingSoon — the marketing surface for a PENDING course (B-10/D1).
 *
 * A pending course is real content that isn't launched yet. Instead of 404ing
 * the series route (which is what the access seam's `not-launched` decision
 * used to do), we render a "coming soon" teaser: name, description, the
 * pending status + access model, and a lesson-count signal. This turns every
 * cross-reference to a not-yet-launched course into a marketing touchpoint
 * rather than a dead link, and the same URL resolves to the full syllabus the
 * moment the course flips live — no content edit needed.
 *
 * a11y: decorative elements are aria-hidden; the CTA is a real link. Tokens
 * (--ink-*, --surface-*, --border-*) so the state restyles in dark mode.
 */
export default function CourseComingSoon({
  series,
  courseRow,
  upcoming,
}: CourseComingSoonProps) {
  return (
    <div className="max-w-[1120px] mx-auto px-6 pt-14">
      <Link
        href="/atlas"
        className="inline-flex items-center gap-1.5 text-gray-500 text-xs font-medium no-underline mb-6 hover:text-navy transition-colors duration-150"
      >
        &larr; Back to Learn
      </Link>

      <div
        className={`rounded-2xl overflow-hidden relative bg-gradient-to-br ${series.gradient} p-8 pb-7 shadow-lg shadow-navy/10`}
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
          {seriesShortLabel(series.slug)}
        </span>
        <span className="relative mb-3.5 ml-1.5 inline-flex items-center gap-2">
          <StatusBadge status={courseRow.status} />
          <AccessModelChip model={courseRow.access_model} />
        </span>
        <h1 className="relative text-[clamp(1.5rem,3vw,2rem)] font-extrabold text-white tracking-[-0.02em] mb-2 leading-tight">
          {series.name}
        </h1>
        <p className="relative text-white text-sm max-w-[560px] leading-relaxed mb-5 bg-black/55 backdrop-blur-sm rounded-xl px-4 py-3">
          {series.description}
        </p>
        <div className="relative inline-flex items-center gap-2 font-mono text-[11px] font-bold text-white uppercase tracking-[0.06em] bg-black/55 backdrop-blur-sm px-3 py-1.5 rounded-full">
          <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-white/80" />
          {upcoming > 0
            ? `${upcoming} lesson${upcoming === 1 ? "" : "s"} coming soon`
            : "Coming soon"}
        </div>
      </div>

      <div className="border border-dashed border-[var(--border-strong)] rounded-2xl px-6 py-12 text-center mt-8">
        <div className="font-mono text-3xl font-bold text-[var(--ink-muted)] tracking-tight mb-3.5">
          Coming soon
        </div>
        <div className="text-[15px] font-bold text-[var(--ink-body)] mb-1.5">
          This track isn&apos;t launched yet
        </div>
        <p className="text-[12.5px] text-[var(--ink-muted)] leading-relaxed max-w-[240px] mx-auto mb-[18px]">
          {series.name} is being written. New lessons publish once the series
          launches — check back soon.
        </p>
        <Link
          href="/atlas"
          className="inline-flex items-center text-xs font-bold text-[var(--ink-on-inverse)] bg-[var(--surface-inverse)] px-[18px] py-2.5 rounded-lg no-underline hover:bg-[var(--surface-inverse-hover)] transition-colors duration-150"
        >
          Browse other tracks
        </Link>
      </div>
    </div>
  );
}
