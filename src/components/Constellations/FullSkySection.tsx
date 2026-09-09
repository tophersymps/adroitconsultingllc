/**
 * FullSkySection — the /profile full-sky hero (P2). "The hero IS the
 * starfield": no marketing hero, no feature cards — just the sky, the
 * rank-ladder rung list, the stat block, and the Chronicle feed.
 *
 * The hero is the 2D celestial chart (`StarChart`): every course is a
 * constellation carrying an engraved figure of what it depicts, and progress
 * lights its star lines. It replaced the immersive 3D galaxy in the Hubble
 * Field Phase 2 port — see `docs/implementation-plan-hubble-field.md` §0 for
 * why the WebGL studies lost. Because the chart is SVG there is no WebGL to
 * fall back from, so the old 3D-plus-2D-fallback split collapses into one
 * surface and the header chrome is a plain sibling rather than an overlay.
 *
 * `ProfileGalaxy3D` is deliberately left in tree and unmounted for one release
 * so the port can be rolled back cheaply.
 *
 * Presentational: the server loader passes a ready ProfileSky payload.
 */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChronicleFeed } from "@/components/Constellations/ChronicleFeed";
import { StreakCounter } from "@/components/Constellations/StreakCounter";
import { RANK_LADDER } from "@/shared/rank-ladder";
import type { FullSkySectionProps, RankId } from "@/shared/contracts-constellations";
import { buildChartFigures } from "@/lib/chart";
import { StarChart } from "./chart/StarChart";

/** Star magnitude color for a rank band (display-only; thresholds live in code). */
const MAGNITUDE_VAR: Record<RankId, string> = {
  starseed: "var(--magnitude-1)",
  wayfarer: "var(--magnitude-2)",
  explorer: "var(--magnitude-3)",
  polestar: "var(--magnitude-4)",
  celestial: "var(--magnitude-5)",
};

/** The header chrome + stat block. A sibling above the chart, never an overlay. */
function SkyHeroChrome({ sky }: FullSkySectionProps) {
  const { stats, constellations } = sky;
  return (
    <div className="relative px-6 py-10 md:px-10 md:py-12">
      <p className="relative font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--sky-ink-muted)]">
        YOUR SKY
      </p>
      <div className="relative mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-[clamp(2.4rem,5vw,3.5rem)] font-extrabold leading-none tracking-[-0.03em] text-[var(--sky-ink)]">
          {stats.rank?.name ?? "Starseed"}
        </h1>
        <span
          aria-hidden="true"
          className="cx-rank-display text-[clamp(1.6rem,3.5vw,2.4rem)] font-medium"
        >
          {stats.rank?.name ?? "Starseed"}
        </span>
      </div>
      <p className="relative mt-2 max-w-[560px] text-[15px] leading-relaxed text-[var(--sky-ink-muted)]">
        {stats.rank?.description ?? RANK_LADDER[0]?.description}
      </p>

      {/* Stat block */}
      <div className="relative mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[1.8rem] font-extrabold leading-none text-[var(--sky-ink)]">
            {stats.coursesCompleted}
          </div>
          <div className="mt-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--sky-ink-muted)]">
            courses
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[1.8rem] font-extrabold leading-none text-[var(--sky-ink)]">
            {constellations.reduce((n, c) => n + c.totalStars, 0)}
          </div>
          <div className="mt-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--sky-ink-muted)]">
            lessons
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[1.8rem] font-extrabold leading-none text-[var(--chronicle-streak)]">
            {stats.streakDays}
          </div>
          <div className="mt-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--sky-ink-muted)]">
            day streak
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[1.8rem] font-extrabold leading-none text-[var(--sky-ink)]">
            {stats.tracksCompleted}
          </div>
          <div className="mt-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--sky-ink-muted)]">
            tracks
          </div>
        </div>
      </div>
    </div>
  );
}

export function FullSkySection({ sky }: FullSkySectionProps) {
  const { stats, constellations, chronicle } = sky;
  const currentId = stats.rank?.id ?? "starseed";
  const router = useRouter();

  /*
   * Focus lives here rather than in the chart so the chart stays
   * presentational. Clicking a figure focuses it and stays on /profile; the
   * inspect panel's CTA is the only thing that navigates.
   */
  const [focusSlug, setFocusSlug] = useState<string | null>(null);
  const figures = useMemo(() => buildChartFigures(sky), [sky]);

  return (
    <section className="cx-sky overflow-hidden" data-testid="full-sky-section">
      <SkyHeroChrome sky={sky} />

      {/* The hero: every course as a constellation figure. The chart centres its
          own wide band (max-width 1500px) with the galaxy filling the frame. */}
      {figures.length > 0 ? (
        <div className="px-6 pb-6 md:px-10">
          <StarChart
            figures={figures}
            focusSlug={focusSlug}
            onFocusChange={setFocusSlug}
            onOpenCourse={(slug) => router.push(`/learn/${slug}`)}
            isGuest={sky.isGuest}
          />
        </div>
      ) : null}

      {/* Rank ladder */}
      <div className="relative max-w-[560px] px-6 pb-2 md:px-10">
        <p className="mb-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--sky-ink-muted)]">
          Rank ladder
        </p>
        <ol className="flex flex-col gap-1.5">
          {RANK_LADDER.map((band, i) => {
            const isCurrent = band.id === currentId;
            const reached = stats.rank !== null && i <= (stats.rank?.index ?? 0);
            return (
              <li
                key={band.id}
                data-testid={`rank-rung-${band.id}`}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 ${
                  isCurrent ? "bg-white/10 ring-1 ring-white/15" : ""
                }`}
              >
                <span
                  aria-hidden
                  className="h-3 w-3 rounded-full"
                  style={{
                    background: reached ? MAGNITUDE_VAR[band.id] : "rgba(255,255,255,0.15)",
                  }}
                />
                <span
                  className={`font-mono text-[12px] font-bold uppercase tracking-[0.06em] ${
                    isCurrent ? "text-[var(--sky-ink)]" : "text-[var(--sky-ink-muted)]"
                  }`}
                >
                  {band.name}
                  {isCurrent ? (
                    <span
                      role="img"
                      aria-label="Current rank"
                      className="ml-1.5 text-[var(--constellation-star-lit)]"
                    >
                      <span aria-hidden="true">· you</span>
                    </span>
                  ) : null}
                </span>
                {reached && !isCurrent ? (
                  <span
                    role="img"
                    aria-label="Reached"
                    className="ml-auto font-mono text-[10px] text-[var(--sky-ink-muted)]"
                  >
                    <span aria-hidden="true">✓</span>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      {/*
        Constellation list + Chronicle.

        The dot grid predates the chart and survives it: the chart draws the
        *figure*, which has as many members as the real constellation has, so it
        cannot show one node per lesson. This list can, and it carries the course
        links and the lit/total counts. It is also the chart's text alternative.
      */}
      <div className="relative grid gap-10 border-t border-white/10 bg-black/25 px-6 py-10 md:grid-cols-2 md:px-10">
        <div>
          <p className="mb-4 font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--sky-ink-muted)]">
            Constellations
          </p>
          {constellations.length === 0 ? (
            <p className="text-[14px] text-[var(--sky-ink-muted)]">
              Complete lessons to chart your first constellation.
            </p>
          ) : (
            <ul className="flex flex-col gap-5">
              {constellations.map((c) => (
                <li key={c.seriesSlug} data-testid={`sky-constellation-${c.seriesSlug}`}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <Link
                      href={`/learn/${c.seriesSlug}`}
                      className="inline-flex min-h-[44px] items-center font-mono text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--sky-ink)] no-underline hover:text-[var(--constellation-star)] transition-colors"
                    >
                      {c.name}
                    </Link>
                    <span className="font-mono text-[11px] text-[var(--sky-ink-muted)]">
                      {c.litStars}/{c.totalStars}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-[5px]">
                    {c.stars.map((star) => (
                      <span
                        key={star.lessonSlug}
                        aria-hidden
                        className={`cx-star ${star.lit ? "is-lit" : "is-locked"}`}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-4 flex items-center gap-2.5">
            <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--sky-ink-muted)]">
              Chronicle
            </p>
            {stats.streakDays > 0 && (
              <span className="ml-auto">
                <StreakCounter streakDays={stats.streakDays} />
              </span>
            )}
          </div>
          <div className="text-[var(--sky-ink)]/90">
            <ChronicleFeed entries={chronicle} />
          </div>
        </div>
      </div>
    </section>
  );
}

export default FullSkySection;
