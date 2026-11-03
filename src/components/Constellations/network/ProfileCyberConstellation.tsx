/**
 * ProfileCyberConstellation.tsx — Grand Cyber-Constellation Network for /profile.
 *
 * Implements Variation 1 of Strategy A: An interconnected, high-tech Tron-style
 * network where each course is a luminous domain nexus hub connected by
 * electric Icy Cyan vector conduits.
 *
 * Adroit Brand Tokens:
 *  - Canvas:      #060F1F to #0B1D3A (Adroit Deep Navy)
 *  - Conduits:    #4FC3F7 (Icy Cyan) with flowing energy pulses
 *  - Mastered:    #C8102E (Adroit Signature Crimson) with neon halo
 *  - Active:      #4FC3F7 ring + #F59E0B (Gold) core
 *  - Exam Crown:  #F59E0B (Gold)
 */
"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import type { ConstellationState } from "@/shared/contracts-constellations";
import { usePrefersReducedMotion } from "../model/usePrefersReducedMotion";

export interface ProfileCyberConstellationProps {
  constellations: ConstellationState[];
  isGuest?: boolean;
  onOpenCourse?: (slug: string) => void;
  className?: string;
}

interface NexusPosition {
  x: number;
  y: number;
}

// Layout positions for up to 8 courses across the cyber-sky
const NETWORK_POSITIONS: NexusPosition[] = [
  { x: 300, y: 180 }, // Center-left anchor
  { x: 500, y: 110 }, // Top-center
  { x: 700, y: 170 }, // Center-right anchor
  { x: 220, y: 320 }, // Bottom-left
  { x: 420, y: 290 }, // Center-bottom
  { x: 620, y: 330 }, // Bottom-right
  { x: 140, y: 160 }, // Far left
  { x: 860, y: 220 }, // Far right
];

export function ProfileCyberConstellation({
  constellations,
  onOpenCourse,
  className = "",
}: ProfileCyberConstellationProps) {
  const reducedMotion = usePrefersReducedMotion();
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, "");

  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => {
    return constellations[0]?.seriesSlug ?? null;
  });

  const selectedCourse = useMemo(() => {
    return constellations.find((c) => c.seriesSlug === selectedSlug) ?? constellations[0] ?? null;
  }, [constellations, selectedSlug]);

  // Generate interconnecting lines between adjacent hubs
  const connections = useMemo(() => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; isLit: boolean }> = [];
    const count = Math.min(constellations.length, NETWORK_POSITIONS.length);
    if (count < 2) return lines;

    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      const c1 = constellations[i]!;
      const c2 = constellations[next]!;
      const p1 = NETWORK_POSITIONS[i]!;
      const p2 = NETWORK_POSITIONS[next]!;

      lines.push({
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        isLit: c1.complete || c2.complete || (c1.litStars > 0 && c2.litStars > 0),
      });

      // Add a cross-chord connection for dense cyber-topology
      if (count >= 4 && i % 2 === 0) {
        const chord = (i + 2) % count;
        const pChord = NETWORK_POSITIONS[chord]!;
        lines.push({
          x1: p1.x,
          y1: p1.y,
          x2: pChord.x,
          y2: pChord.y,
          isLit: c1.complete,
        });
      }
    }
    return lines;
  }, [constellations]);

  if (constellations.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400 font-mono text-xs">
        No active course constellations yet.
      </div>
    );
  }

  return (
    <div
      data-testid="profile-cyber-constellation"
      className={`relative rounded-2xl border border-cyan-500/25 bg-gradient-to-b from-[#060F1F] via-[#09152B] to-[#0B1D3A] p-4 md:p-6 shadow-2xl overflow-hidden ${className}`}
    >
      {/* Background Cyber Grid */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,#4FC3F708_1px,transparent_1px),linear-gradient(to_bottom,#4FC3F708_1px,transparent_1px)] bg-[size:28px_28px] opacity-70 pointer-events-none"
      />

      {/* Ambient Starlight Nebula */}
      <div
        aria-hidden="true"
        className="absolute top-1/4 left-1/3 w-80 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-1/4 right-1/4 w-72 h-44 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"
      />

      {/* Top Legend Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3 text-xs font-mono">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-[#C8102E] shadow-[0_0_8px_#C8102E]" /> Mastered Course
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-[#4FC3F7] animate-pulse" /> In Progress
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600" /> Unstarted
          </span>
        </div>
        <span className="text-slate-400">💡 Click any course hub to inspect telemetry</span>
      </div>

      {/* Interactive SVG Network Canvas */}
      <div className="relative z-10 my-4 flex justify-center">
        <svg
          className="w-full max-w-[960px] h-[360px] md:h-[420px]"
          viewBox="0 0 1000 440"
          fill="none"
          role="group"
          aria-label="Interactive career constellation network"
        >
          <defs>
            <radialGradient id={`hub-glow-${uid}`}>
              <stop offset="0%" stopColor="#4FC3F7" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#4FC3F7" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`hub-crimson-${uid}`}>
              <stop offset="0%" stopColor="#C8102E" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#C8102E" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Circuit Lines / Conduits */}
          <g strokeWidth="1.5" className="text-cyan-900/40">
            {connections.map((l, idx) => (
              <line
                key={`base-line-${idx}`}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke="currentColor"
              />
            ))}
          </g>

          {/* Lit Energetic Circuit Conduits */}
          <g strokeWidth="2">
            {connections.map((l, idx) => {
              if (!l.isLit) return null;
              return (
                <line
                  key={`lit-line-${idx}`}
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  stroke="#4FC3F7"
                  strokeDasharray="6 6"
                  className={reducedMotion ? "" : "animate-[dash-flow_3s_linear_infinite]"}
                />
              );
            })}
          </g>

          {/* Course Nexus Hubs */}
          {constellations.slice(0, NETWORK_POSITIONS.length).map((course, idx) => {
            const pos = NETWORK_POSITIONS[idx]!;
            const isSelected = course.seriesSlug === selectedSlug;
            const isComplete = course.complete;
            const isInProgress = !isComplete && course.litStars > 0;
            const pct =
              course.totalStars > 0
                ? Math.round((course.litStars / course.totalStars) * 100)
                : 0;

            return (
              <g
                key={course.seriesSlug}
                data-testid={`cyber-hub-${course.seriesSlug}`}
                tabIndex={0}
                role="button"
                aria-label={`${course.name} — ${course.litStars} of ${course.totalStars} lessons completed`}
                onClick={() => setSelectedSlug(course.seriesSlug)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedSlug(course.seriesSlug);
                  }
                }}
                className="cursor-pointer transition-transform duration-200 hover:scale-105 outline-none"
              >
                {/* Selection Orbit Halo */}
                {isSelected && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={36}
                    stroke="#4FC3F7"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    fill="none"
                    className="animate-spin origin-center"
                    style={{ transformOrigin: `${pos.x}px ${pos.y}px`, animationDuration: "10s" }}
                  />
                )}

                {/* Outer Glow Halo */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={28}
                  fill={`url(#${isComplete ? `hub-crimson-${uid}` : `hub-glow-${uid}`})`}
                  className={reducedMotion ? "" : isInProgress ? "animate-pulse" : ""}
                />

                {/* Main Hub Body */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={20}
                  className={`transition-colors ${
                    isComplete
                      ? "fill-[#060F1F] stroke-[#C8102E]"
                      : isInProgress
                      ? "fill-[#060F1F] stroke-[#4FC3F7]"
                      : "fill-[#060F1F] stroke-slate-700"
                  }`}
                  strokeWidth={isSelected ? 3 : 2}
                />

                {/* Hub Center Icon / Badge */}
                {isComplete ? (
                  <text
                    x={pos.x}
                    y={pos.y + 5}
                    textAnchor="middle"
                    className="fill-[#E8354A] font-bold text-sm select-none"
                  >
                    ★
                  </text>
                ) : isInProgress ? (
                  <circle cx={pos.x} cy={pos.y} r={6} fill="#4FC3F7" />
                ) : (
                  <circle cx={pos.x} cy={pos.y} r={4} fill="#64748b" />
                )}

                {/* Hub Label */}
                <text
                  x={pos.x}
                  y={pos.y + 38}
                  textAnchor="middle"
                  className={`font-mono text-[11px] font-bold select-none ${
                    isSelected
                      ? "fill-white"
                      : isComplete
                      ? "fill-slate-200"
                      : "fill-slate-400"
                  }`}
                >
                  {course.name.length > 22 ? `${course.name.slice(0, 20)}…` : course.name}
                </text>

                {/* Progress Subtext */}
                <text
                  x={pos.x}
                  y={pos.y + 50}
                  textAnchor="middle"
                  className="font-mono text-[9.5px] fill-[#4FC3F7] select-none"
                >
                  {isComplete ? "100% Mastered" : `${course.litStars}/${course.totalStars} (${pct}%)`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected Course Inspector Card */}
      {selectedCourse && (
        <div
          data-testid="cyber-inspect-panel"
          className="relative z-10 mt-2 p-4 md:p-5 rounded-xl border border-cyan-500/30 bg-[#060F1F]/80 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[10.5px] uppercase font-bold tracking-wider text-[#4FC3F7]">
                Selected Course Hub
              </span>
              {selectedCourse.complete && (
                <span className="font-mono text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.2 rounded border border-emerald-500/20">
                  Certified
                </span>
              )}
            </div>
            <h4 className="text-base font-extrabold text-white">
              {selectedCourse.name}
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              {selectedCourse.complete
                ? "All competencies charted and verified."
                : `${selectedCourse.litStars} of ${selectedCourse.totalStars} lessons completed.`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/atlas/${selectedCourse.seriesSlug}`}
              onClick={() => onOpenCourse?.(selectedCourse.seriesSlug)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#4FC3F7] to-[#0284C7] hover:from-[#38BDF8] hover:to-[#0369A1] text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition active:scale-95"
            >
              {selectedCourse.complete ? "Review Course Matrix →" : "Continue Course Matrix →"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileCyberConstellation;
