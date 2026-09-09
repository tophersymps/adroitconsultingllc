import Link from "next/link";
import { LearnCardSeries } from "@/data/types";
import { seriesShortLabel } from "@/lib/learn-client";
import SeriesProgress from "@/components/Progress/SeriesProgress";
import QuizStats from "@/components/Progress/QuizStats";
import DifficultyPill from "./DifficultyPill";
import PathConstellation from "@/components/Constellations/PathConstellation";
import type { CardGateState } from "@/shared/contracts-account";

interface PathCardProps {
  series: LearnCardSeries;
  /** guest-locked → non-clickable card + sign-in CTA; signed-in → clickable Link. */
  gate: CardGateState;
  /** next query for the guest CTA (defaults to the series syllabus). */
  loginNext?: string;
}

/** Landing-page card per learning path (mockup: mockup-learn-hub-round3.html). */
export default function PathCard({ series, gate, loginNext }: PathCardProps) {
  const empty = series.lessonCount === 0;
  const isGuest = gate === "guest-locked";
  const isSignedInLocked = !isGuest && !series.canAccess && !empty;
  const loginHref = `/login?next=${encodeURIComponent(loginNext ?? `/learn/${series.slug}`)}`;

  const band = (
    <>
      {/* Gradient header band */}
      <div
        className={`h-[132px] relative overflow-hidden bg-gradient-to-br ${series.gradient}`}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.25) 0%, transparent 45%), radial-gradient(circle at 20% 100%, rgba(255,255,255,0.12) 0%, transparent 40%)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 transition-opacity duration-300 group-hover:opacity-80" />
        {!isGuest && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <span className="translate-y-2 group-hover:translate-y-0 transition-transform duration-300 inline-flex items-center gap-1.5 text-white text-xs font-bold bg-black/25 backdrop-blur-sm px-3 py-1.5 rounded-full">
              Start track <span aria-hidden>&rarr;</span>
            </span>
          </div>
        )}
        <span className="absolute bottom-3.5 left-5 bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs font-bold text-white uppercase tracking-[0.06em] z-10">
          {seriesShortLabel(series.slug)}
        </span>
        {/* Learn v2 profile (ADR-208): track Level N pill + difficulty. */}
        {series.level != null ? (
          <span className="absolute top-3.5 left-5 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-full text-[9.5px] font-bold text-white uppercase tracking-[0.07em] font-mono z-10">
            Level {series.level}
          </span>
        ) : (
          series.difficulty && (
            <span className="absolute top-3.5 left-5 z-10">
              <DifficultyPill
                difficulty={series.difficulty as "Beginner" | "Intermediate" | "Advanced"}
                onGradient
              />
            </span>
          )
        )}
        <span className="absolute top-3.5 right-4 bg-black/55 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10.5px] font-bold text-white font-mono z-10">
          {series.lessonCount} / {series.totalLessons} lessons
        </span>
        {/* Constellation + Chronicle (B-18): compact star preview in the band.
            Signed-in shows real progress; guests get the locked shape. */}
        <div className="absolute bottom-3.5 right-5 z-10">
          <PathConstellation series={series} isGuest={isGuest} />
        </div>
      </div>

      {/* Body */}
      <div className="p-[22px] pb-6">
        <h3 className="text-xl font-bold text-[var(--ink-primary)] tracking-tight mb-1.5 leading-snug transition-colors duration-200 group-hover:text-[var(--accent)]">
          {series.name}
        </h3>
        <p className="text-[13.5px] text-[var(--ink-muted)] leading-relaxed mb-[18px] line-clamp-2">
          {series.description}
        </p>

        {empty ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-[var(--ink-faint)] uppercase tracking-[0.06em] bg-[var(--surface-sunken)] border border-dashed border-[var(--border-strong)] px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--ink-faint)]" />
            Coming soon
          </span>
        ) : isGuest ? (
          /* Guest-locked state: name + description visible, non-clickable, CTA */
          <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)] mb-[11px]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                className="w-3.5 h-3.5 text-[var(--accent)] flex-shrink-0"
                aria-hidden="true"
              >
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <span>Sign in to track progress on this path</span>
            </div>
            <Link
              href={loginHref}
              className="inline-flex items-center gap-2 bg-[var(--surface-inverse)] text-[var(--ink-on-inverse)] text-[12.5px] font-bold px-[18px] h-11 rounded-full no-underline hover:bg-[var(--surface-inverse-hover)] hover:-translate-y-px active:scale-[0.98] transition-all duration-150"
            >
              Sign in to access courses <span aria-hidden>&rarr;</span>
            </Link>
          </div>
        ) : (
          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]">
            {/* Real per-series completion for signed-in users (client island). */}
            <SeriesProgress
              lessonSlugs={series.lessonSlugs}
              showPercent
            />
            {/* Quiz average + attempt count — informational only; the whole card
                links to the series, so the strip must not be a nested anchor. */}
            <div className="mt-2.5">
              <QuizStats seriesSlug={series.slug} as="span" />
            </div>
            {/* Signed-in but locked: subtle "Preview first lesson →" affordance
                (ADR-221). Granted users are redirected to the real lesson, so
                the link is never harmful. */}
            {isSignedInLocked && (
              <Link
                href={`/learn/${series.slug}/preview`}
                className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold no-underline hover:underline min-h-[44px] px-3"
                style={{ color: "var(--accent, #C8102E)" }}
              >
                Preview first lesson <span aria-hidden>&rarr;</span>
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );

  if (isGuest) {
    return (
      <div className="group block rounded-2xl overflow-hidden border border-[var(--border-default)] bg-[var(--surface-card)]">
        {band}
      </div>
    );
  }

  return (
    <Link
      href={`/learn/${series.slug}`}
      className="group block rounded-2xl overflow-hidden border border-[var(--border-default)] bg-[var(--surface-card)] hover:shadow-xl hover:border-[var(--border-strong)] hover:-translate-y-[3px] transition-all duration-300 no-underline"
    >
      {band}
    </Link>
  );
}
