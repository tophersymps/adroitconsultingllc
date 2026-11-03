/**
 * SeriesTronRoadmap.tsx — The on-course Tron-Matrix Roadmap for /atlas/[series].
 *
 * Replaces the static 17th-century engraving chart with an interactive,
 * tiered competency roadmap (Foundations → Integration → Capstone Exam)
 * rendered in the Adroit Tron visual aesthetic.
 *
 * Adroit Brand Tokens:
 *  - Canvas / Background: #060F1F to #0B1D3A (Adroit Deep Navy)
 *  - Conduits / Rails:    #4FC3F7 (Icy Cyan)
 *  - Mastered / Lit:      #C8102E (Adroit Signature Crimson)
 *  - Current / Active:    #4FC3F7 ring + #F59E0B (Gold) core
 *  - Exam Crown:          #F59E0B (Radiant Gold)
 */
"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ConstellationState, ConstellationStar } from "@/shared/contracts-constellations";
import { usePrefersReducedMotion } from "../model/usePrefersReducedMotion";

export interface SeriesTronRoadmapProps {
  constellation: ConstellationState;
  isGuest?: boolean;
  className?: string;
}

interface TierGroup {
  id: number;
  title: string;
  stars: ConstellationStar[];
  completedCount: number;
}

const TIER_TITLES = [
  "Foundations & Core Architecture",
  "Integration & Messaging Patterns",
  "Scalability & Enterprise Governance",
  "Advanced Optimization & Capstone",
];

export function SeriesTronRoadmap({
  constellation,
  isGuest = false,
  className = "",
}: SeriesTronRoadmapProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { seriesSlug, name, litStars, totalStars, complete, examPassed, stars } = constellation;

  const pct = totalStars > 0 ? Math.round((litStars / totalStars) * 100) : 0;

  // Determine current active (first unlit) lesson
  const currentStarIndex = useMemo(() => {
    return stars.findIndex((s) => !s.lit);
  }, [stars]);

  // Group lessons into logical sequential tiers (3-4 lessons per tier)
  const tiers = useMemo<TierGroup[]>(() => {
    if (!stars || stars.length === 0) return [];
    
    // Choose chunk size dynamically
    const chunkSize = stars.length <= 4 ? 4 : stars.length <= 9 ? 3 : 4;
    const groups: TierGroup[] = [];
    
    for (let i = 0; i < stars.length; i += chunkSize) {
      const chunk = stars.slice(i, i + chunkSize);
      const tierIndex = groups.length;
      const title = TIER_TITLES[tierIndex] || `Milestone Tier ${tierIndex + 1}`;
      const completedCount = chunk.filter((s) => s.lit).length;
      groups.push({
        id: tierIndex + 1,
        title,
        stars: chunk,
        completedCount,
      });
    }
    return groups;
  }, [stars]);

  return (
    <section
      data-testid="series-tron-roadmap"
      aria-label={`Roadmap for ${name}`}
      className={`relative rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-[#060F1F] via-[#09152B] to-[#0B1D3A] p-5 md:p-8 shadow-2xl overflow-hidden ${className}`}
    >
      {/* Subtle Tron Isometric Grid Background */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,#4FC3F708_1px,transparent_1px),linear-gradient(to_bottom,#4FC3F708_1px,transparent_1px)] bg-[size:32px_32px] opacity-70 pointer-events-none"
      />

      {/* Top Ambient Glow Orb */}
      <div
        aria-hidden="true"
        className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"
      />

      {/* Header Telemetry Strip */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[#4FC3F7] px-2 py-0.5 rounded bg-[#4FC3F7]/10 border border-[#4FC3F7]/25">
              Course Competency Matrix
            </span>
            {complete && (
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30">
                Course Complete
              </span>
            )}
            {examPassed && (
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#F59E0B] px-2 py-0.5 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/30 flex items-center gap-1">
                <span>👑</span> Exam Certified
              </span>
            )}
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight">
            {name}
          </h2>
        </div>

        {/* Live Progress Telemetry */}
        <div className="flex flex-col md:items-end">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-slate-400">Mastery:</span>
            <span className="font-mono text-sm font-bold text-white">
              <strong className="text-[#4FC3F7]">{litStars}</strong> / {totalStars} Lessons
            </span>
            <span className="font-mono text-xs font-semibold text-slate-300 bg-white/10 px-2 py-0.5 rounded-full">
              {pct}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full md:w-56 h-2 bg-slate-800/80 rounded-full mt-2 overflow-hidden border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-[#4FC3F7] to-[#C8102E] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Roadmap Tiers */}
      <div className="relative z-10 mt-8 space-y-8">
        {tiers.map((tier, tierIdx) => {
          return (
            <div
              key={tier.id}
              className="relative p-4 md:p-5 rounded-xl border border-white/10 bg-[#060F1F]/60 backdrop-blur-sm"
            >
              {/* Tier Header Line */}
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#4FC3F7]">
                    Tier {tier.id}
                  </span>
                  <span className="text-slate-400 text-xs">·</span>
                  <h3 className="text-sm font-bold text-slate-200">
                    {tier.title}
                  </h3>
                </div>
                <span className="font-mono text-xs text-slate-400">
                  {tier.completedCount} / {tier.stars.length} Complete
                </span>
              </div>

              {/* Tier Nodes Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative">
                {tier.stars.map((star, idx) => {
                  const globalIndex =
                    tiers.slice(0, tierIdx).reduce((acc, t) => acc + t.stars.length, 0) + idx;
                  const isMastered = star.lit;
                  const isCurrent = globalIndex === currentStarIndex;

                  // Target lesson URL
                  const lessonHref = `/atlas/${seriesSlug}/${star.lessonSlug}`;

                  return (
                    <Link
                      key={star.lessonSlug}
                      href={lessonHref}
                      data-testid={`tron-node-${star.lessonSlug}`}
                      aria-label={`${star.label} — ${
                        isMastered ? "Mastered" : isCurrent ? "Current active lesson" : "Upcoming lesson"
                      }`}
                      className={`group relative min-h-[64px] p-3.5 rounded-xl border transition-all duration-200 flex items-center justify-between gap-3 text-left ${
                        isMastered
                          ? "bg-[#C8102E]/10 border-[#C8102E]/40 hover:border-[#C8102E] hover:bg-[#C8102E]/20"
                          : isCurrent
                          ? `bg-[#4FC3F7]/10 border-[#4FC3F7] ${
                              reducedMotion ? "" : "shadow-[0_0_15px_rgba(79,195,247,0.25)]"
                            } hover:bg-[#4FC3F7]/15`
                          : "bg-slate-900/40 border-white/10 hover:border-white/20 opacity-70 hover:opacity-90"
                      }`}
                    >
                      {/* Node Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className={`font-mono text-[10px] uppercase font-bold tracking-wider ${
                              isMastered
                                ? "text-[#E8354A]"
                                : isCurrent
                                ? "text-[#4FC3F7]"
                                : "text-slate-500"
                            }`}
                          >
                            Lesson {star.index}
                          </span>
                          {isCurrent && (
                            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#F59E0B] px-1.5 py-0.2 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/30 animate-pulse">
                              Active
                            </span>
                          )}
                        </div>
                        <h4
                          className={`text-xs font-bold truncate leading-tight ${
                            isMastered
                              ? "text-white"
                              : isCurrent
                              ? "text-cyan-100"
                              : "text-slate-400 group-hover:text-slate-300"
                          }`}
                        >
                          {star.label}
                        </h4>
                      </div>

                      {/* Status Icon */}
                      <div className="flex-shrink-0">
                        {isMastered ? (
                          <div className="w-6 h-6 rounded-full bg-[#C8102E] text-white flex items-center justify-center font-bold text-xs shadow-[0_0_10px_#C8102E]">
                            ✓
                          </div>
                        ) : isCurrent ? (
                          <div className="w-6 h-6 rounded-full border-2 border-[#4FC3F7] bg-[#4FC3F7]/20 flex items-center justify-center text-[#4FC3F7] text-xs font-bold">
                            <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-ping" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-slate-500 text-xs">
                            ○
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Terminal Exam Capstone Node */}
        <div className="relative p-5 rounded-xl border border-[#F59E0B]/30 bg-gradient-to-r from-[#060F1F] via-[#1a1408] to-[#060F1F] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold border transition-all ${
                examPassed
                  ? "bg-[#F59E0B]/20 border-[#F59E0B] text-[#F59E0B] shadow-[0_0_20px_rgba(245,158,11,0.35)]"
                  : complete
                  ? "bg-[#F59E0B]/10 border-[#F59E0B]/60 text-[#F59E0B] animate-pulse"
                  : "bg-slate-900 border-white/10 text-slate-500"
              }`}
            >
              {examPassed ? "👑" : complete ? "★" : "🔒"}
            </div>
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#F59E0B]">
                Apex Milestone
              </span>
              <h4 className="text-sm font-bold text-white">
                Course Completion & Certification Exam
              </h4>
              <p className="text-xs text-slate-400">
                {examPassed
                  ? "Exam Passed! Your verified certification credential is active."
                  : complete
                  ? "All lessons mastered! You are now eligible to take the certification exam."
                  : `Complete all ${totalStars} lessons to unlock the final certification exam.`}
              </p>
            </div>
          </div>

          <div>
            {examPassed ? (
              <Link
                href={`/atlas/${seriesSlug}/certificate`}
                className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] hover:from-[#F59E0B] hover:to-[#B45309] text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition active:scale-95"
              >
                View Credential & LinkedIn Pass →
              </Link>
            ) : complete ? (
              <Link
                href={`/atlas/${seriesSlug}/exam`}
                className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-[#4FC3F7] hover:bg-[#38BDF8] text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition active:scale-95"
              >
                Launch Exam →
              </Link>
            ) : (
              <span className="font-mono text-xs text-slate-500 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                Exam Locked ({litStars}/{totalStars} Lessons)
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default SeriesTronRoadmap;
