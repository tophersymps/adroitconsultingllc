/**
 * CertificateCelebration — the certificate completion moment (P2). Rendered on
 * the certificate page when the constellation is complete: a lit-star field
 * pulse + reveal. Presentational — eligibility is derived by the page; this
 * only renders the celebratory state above the printable certificate.
 */
"use client";

import { StreakCounter } from "@/components/Constellations/StreakCounter";
import type { CertificateCelebrationProps } from "@/shared/contracts-constellations";

export function CertificateCelebration({
  courseName,
  constellation,
  streakDays,
}: CertificateCelebrationProps) {
  const { litStars, totalStars } = constellation;

  return (
    <div
      data-testid="certificate-celebration"
      className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-end gap-2">
          <span className="cx-ignite h-12 w-12 rounded-full" style={{ background: "var(--constellation-star-lit)", boxShadow: "0 0 0 6px var(--constellation-halo), 0 0 24px var(--constellation-halo)" }} />
          <span aria-hidden className="cx-cert-glyph text-2xl">★</span>
        </div>

        <div>
          <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
            {courseName}
          </p>
          <h2 className="mt-1 text-[1.35rem] font-extrabold tracking-[-0.02em] text-[var(--ink-primary)]">
            Constellation complete.
          </h2>
          <p className="mt-1 font-mono text-[12px] text-[var(--ink-muted)]">
            {litStars}/{totalStars} stars lit — your certificate is ready below.
          </p>
        </div>

        {streakDays > 0 && (
          <div className="rounded-full bg-[var(--chronicle-streak)]/10 px-3 py-1.5">
            <StreakCounter streakDays={streakDays} />
          </div>
        )}

        <span aria-hidden className="font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)]">
          Issued by Adroit Consulting
        </span>
      </div>
    </div>
  );
}

export default CertificateCelebration;
