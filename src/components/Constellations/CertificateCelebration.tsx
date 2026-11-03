/**
 * CertificateCelebration — the certificate completion moment (P2).
 *
 * Upgraded to the Adroit Tron Verified Credential Pass:
 *  - Official Adroit certification stamp & unique verification ID
 *  - 1-Click "Add to LinkedIn Profile" integration
 *  - Adroit brand styling (#060F1F, #0B1D3A, #4FC3F7, #C8102E, #F59E0B)
 *  - Preserves data-testid="certificate-celebration" and accessibility
 */
"use client";

import { useMemo } from "react";
import { StreakCounter } from "@/components/Constellations/StreakCounter";
import type { CertificateCelebrationProps } from "@/shared/contracts-constellations";

export function CertificateCelebration({
  seriesSlug,
  courseName,
  constellation,
  streakDays,
}: CertificateCelebrationProps) {
  const { litStars, totalStars } = constellation;
  const slug = seriesSlug || constellation.seriesSlug;

  // Generate deterministic verification ID format: ADR-{SLUG}-CERT
  const certId = useMemo(() => {
    const cleanSlug = slug.toUpperCase().replace(/[^A-Z0-9]/g, "-");
    return `ADR-${cleanSlug}-VERIFIED`;
  }, [slug]);

  // Construct official 1-click LinkedIn Add to Profile URL
  const linkedInUrl = useMemo(() => {
    const now = new Date();
    const params = new URLSearchParams({
      startTask: "CERTIFICATION_NAME",
      name: courseName,
      organizationName: "Adroit Consulting LLC",
      issueYear: String(now.getFullYear()),
      issueMonth: String(now.getMonth() + 1),
      certUrl: `https://adroitconsulting.com/atlas/${slug}/certificate`,
      certId: certId,
    });
    return `https://www.linkedin.com/profile/add?${params.toString()}`;
  }, [courseName, slug, certId]);

  return (
    <div
      data-testid="certificate-celebration"
      className="relative rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-[#060F1F] via-[#09152B] to-[#0B1D3A] p-6 md:p-8 shadow-2xl overflow-hidden text-center"
    >
      {/* Background Cyber Grid */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,#4FC3F708_1px,transparent_1px),linear-gradient(to_bottom,#4FC3F708_1px,transparent_1px)] bg-[size:24px_24px] opacity-70 pointer-events-none"
      />

      {/* Radiant Top Glow */}
      <div
        aria-hidden="true"
        className="absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"
      />

      <div className="relative z-10 flex flex-col items-center gap-4">
        {/* Crown Badge */}
        <div className="flex items-center gap-2">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-[#C8102E] to-[#E8354A] text-white text-2xl font-bold shadow-[0_0_24px_#C8102E]"
          >
            ★
          </span>
          <span
            aria-hidden="true"
            className="cx-cert-glyph flex h-14 w-14 items-center justify-center rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/15 text-[#F59E0B] text-2xl font-bold shadow-[0_0_20px_rgba(245,158,11,0.25)]"
          >
            👑
          </span>
        </div>

        <div>
          <span className="font-mono text-[10.5px] font-bold uppercase tracking-widest text-[#4FC3F7] px-2.5 py-0.5 rounded bg-[#4FC3F7]/10 border border-[#4FC3F7]/25">
            {courseName}
          </span>
          <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
            Constellation complete.
          </h2>
          <p className="mt-1 font-mono text-xs text-slate-300">
            {litStars}/{totalStars} stars lit — your certificate is ready below.
          </p>
        </div>

        {/* Verification Credential Box */}
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#060F1F]/70 p-4 text-left">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#F59E0B]">
              Verified Digital Credential
            </span>
            <span className="font-mono text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.2 rounded border border-emerald-500/20">
              Active / Authenticated
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-300">
            <div>
              <span className="text-slate-500 text-[10px] block">Credential ID</span>
              <span className="text-white font-bold">{certId}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">Issuing Authority</span>
              <span className="text-white font-bold">Adroit Consulting</span>
            </div>
          </div>
        </div>

        {/* Action Buttons: Add to LinkedIn & Streak */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md">
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:flex-1 py-2.5 px-4 bg-[#0a66c2] hover:bg-[#084e96] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/25 active:scale-95"
          >
            <svg className="w-4 h-4 fill-current flex-shrink-0" viewBox="0 0 24 24">
              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
            </svg>
            <span>Add to LinkedIn Profile</span>
          </a>

          <button
            type="button"
            onClick={() => window.print()}
            className="w-full sm:w-auto py-2.5 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 font-bold text-xs transition active:scale-95"
          >
            Print / PDF
          </button>
        </div>

        {streakDays > 0 && (
          <div className="rounded-full bg-[#C8102E]/10 border border-[#C8102E]/20 px-3.5 py-1.5">
            <StreakCounter streakDays={streakDays} />
          </div>
        )}

        <span
          aria-hidden="true"
          className="font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-500 mt-1"
        >
          Issued by Adroit Consulting LLC · Verified Credential Engine
        </span>
      </div>
    </div>
  );
}

export default CertificateCelebration;
