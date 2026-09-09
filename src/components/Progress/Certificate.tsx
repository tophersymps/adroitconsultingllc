/**
 * Certificate — printable certificate of completion (client).
 *
 * Server-validated eligibility is derived in the certificate page; this
 * component only renders. Matches design/mockup-certificate.html (kara) and
 * copy deck §7 — the navy/red frame, recipient name, series name, completion
 * date, exam score, SVG seal. NO image generation.
 *
 * Print: `print:hidden` chrome is on the page wrapper; the document CSS below
 * handles @page margins + print-color-adjust so the navy frame and red seal
 * survive paper. The print button calls window.print().
 */
"use client";

import { useEffect, useRef } from "react";
import { trackCertificateViewed } from "@/lib/analytics";

interface CertificateProps {
  /** Recipient display name (user full_name / name / email). */
  recipientName: string;
  /** Course name shown in the body + Course meta (copy deck §7). */
  courseName: string;
  /** Formatted completion date, e.g. "Aug 10, 2026". */
  completedAt: string;
  /** Exam best score 0-100. */
  examScore: number;
  /** Planned lesson count (e.g. 46). */
  totalLessons: number;
  /** Series slug — used for progress-funnel analytics (backlog B-06). */
  series?: string;
}

export default function Certificate({
  recipientName,
  courseName,
  completedAt,
  examScore,
  totalLessons,
  series,
}: CertificateProps) {
  const certFiredRef = useRef(false);
  // Progress-funnel analytics (B-06): certificate is the terminal event of the
  // lesson → quiz → exam → certificate funnel. Fire once on mount — the page
  // only renders this component when server-validated eligibility passes.
  useEffect(() => {
    if (certFiredRef.current) return;
    certFiredRef.current = true;
    trackCertificateViewed({ series: series ?? "", courseName });
  }, [series, courseName]);
  return (
    <div className="max-w-[960px] mx-auto px-6 pt-10 pb-24">
      {/* ── Page head (hidden on print) ─────────────────────────────── */}
      <div className="print:hidden flex items-end justify-between gap-4 flex-wrap mb-7">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-red uppercase tracking-[0.09em]">
            <span className="w-[3px] h-3 rounded-sm bg-red" />
            Certificate of Completion
          </div>
          {/* a11y (finding 3): page chrome is NOT a heading — the certificate
              document's cert-title below is the single h1 of this page, so the
              printable view carries a proper h1 heading structure. */}
          <p className="text-[clamp(1.7rem,4vw,2.25rem)] font-extrabold text-navy tracking-[-0.02em] leading-tight mt-1.5">
            Your certificate
          </p>
          <p className="text-[14px] text-gray-500 max-w-[640px] mt-2 leading-relaxed">
            Issued by Adroit Consulting when all {totalLessons} lessons are completed and the
            cert prep exam is passed at 72% or higher.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2.5 h-[46px] px-[22px] rounded-xl bg-navy text-white text-[14px] font-bold cursor-pointer hover:bg-navy-light transition-colors duration-150"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden="true"
          >
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          Print certificate
        </button>
      </div>

      {/* ── Certificate document ────────────────────────────────────── */}
      <div className="certificate-print">
        <div className="cert-frame">
          <div className="cert-frame-inner">
            <div className="cert-kicker">Adroit Consulting · Certified Training</div>
            <h1 className="cert-title">Certificate of Completion</h1>
            <div className="cert-rule" />
            <div className="cert-recipient-label">This certifies that</div>
            <div className="cert-recipient">{recipientName}</div>
            <p className="cert-body">
              has successfully completed the <b>{courseName}</b> curriculum — all {totalLessons}{" "}
              lessons and the timed certification exam.
            </p>
            <div className="cert-meta">
              <div className="m">
                <b>Course</b>
                {courseName}
              </div>
              <div className="m">
                <b>Completed</b>
                {completedAt}
              </div>
              <div className="m">
                <b>Exam score</b>
                {examScore}%
              </div>
            </div>
            <div className="cert-seal-row">
              <div className="cert-seal" role="img" aria-label="Adroit seal">
                <svg viewBox="0 0 92 92">
                  <circle cx="46" cy="46" r="44" fill="#FFFDF8" stroke="#C8102E" strokeWidth="3" />
                  <circle
                    cx="46"
                    cy="46"
                    r="36"
                    fill="none"
                    stroke="rgba(200,16,46,0.45)"
                    strokeWidth="1"
                  />
                  <circle
                    cx="46"
                    cy="46"
                    r="30"
                    fill="none"
                    stroke="#C8102E"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                </svg>
                <div className="seal-inner">
                  <span className="seal-letter">A</span>
                  <span className="seal-sub">Adroit</span>
                </div>
              </div>
            </div>
            <div className="cert-foot">
              <div className="sig">
                <b>Adroit Consulting</b>
                Training &amp; Enablement
                <div className="line" />
              </div>
              <div className="issuer">
                ADROIT CONSULTING
                <br />
                CERTIFIED TRAINING · 2026
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Certificate + print CSS (scoped to this component) ──────── */}
      <style>{`
        .certificate-print {
          background: #FFFDF8;
          color: #0B1D3A;
          border-radius: 6px;
          padding: 14px;
          box-shadow: 0 1px 2px rgba(11,29,58,0.04), 0 8px 28px -8px rgba(11,29,58,0.18);
        }
        .cert-frame { border: 2px solid #0B1D3A; padding: 10px; }
        .cert-frame-inner {
          border: 1px solid rgba(11,29,58,0.3);
          padding: 46px 56px 40px;
          text-align: center;
          position: relative;
        }
        .cert-kicker {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #6B7280;
          margin-bottom: 18px;
        }
        .cert-title {
          font-size: clamp(1.9rem, 4.2vw, 2.5rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.15;
          color: #0B1D3A;
          margin-bottom: 8px;
        }
        .cert-rule {
          width: 72px;
          height: 3px;
          background: #C8102E;
          border-radius: 3px;
          margin: 20px auto 22px;
        }
        .cert-recipient-label {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #6B7280;
          margin-bottom: 10px;
        }
        .cert-recipient {
          font-size: clamp(1.75rem, 4vw, 2.25rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #0B1D3A;
          line-height: 1.2;
          margin-bottom: 18px;
        }
        .cert-body {
          font-size: 14.5px;
          color: #4B5563;
          max-width: 520px;
          margin: 0 auto 22px;
          line-height: 1.7;
        }
        .cert-body b { color: #1F2937; }
        .cert-meta {
          display: flex;
          justify-content: center;
          gap: 26px;
          flex-wrap: wrap;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 11px;
          color: #6B7280;
          letter-spacing: 0.04em;
          margin-bottom: 26px;
        }
        .cert-meta .m b {
          display: block;
          font-weight: 700;
          color: #0B1D3A;
          font-size: 11.5px;
          margin-bottom: 2px;
          letter-spacing: 0.05em;
        }
        .cert-seal-row { display: flex; justify-content: center; margin-top: 8px; }
        .cert-seal { position: relative; width: 92px; height: 92px; }
        .cert-seal svg { width: 100%; height: 100%; }
        .cert-seal .seal-inner {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
        }
        .cert-seal .seal-letter {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-weight: 800;
          font-size: 30px;
          color: #C8102E;
          line-height: 1;
        }
        .cert-seal .seal-sub {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 6.5px;
          font-weight: 700;
          color: #C8102E;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-top: 2px;
        }
        .cert-foot {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          margin-top: 26px;
          text-align: left;
        }
        .cert-foot .sig { font-size: 12px; color: #6B7280; }
        .cert-foot .sig b {
          display: block;
          font-size: 13px;
          color: #1F2937;
          font-weight: 700;
          margin-bottom: 2px;
        }
        .cert-foot .sig .line {
          width: 140px;
          height: 1px;
          background: #D1D5DB;
          margin-top: 12px;
        }
        .cert-foot .issuer {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 10px;
          letter-spacing: 0.06em;
          color: #6B7280;
          text-align: right;
        }
        @media (max-width: 720px) {
          .cert-frame-inner { padding: 30px 22px 26px; }
          .cert-meta { gap: 14px; flex-direction: column; align-items: center; }
          .cert-foot { flex-direction: column; align-items: flex-start; }
        }
        @media print {
          @page { margin: 0; }
          body { background: #fff; }
          .certificate-print {
            box-shadow: none;
            border-radius: 0;
            padding: 6px;
          }
          .cert-frame { border: 2px solid #0B1D3A; padding: 8px; }
          .cert-frame-inner {
            border: 1px solid rgba(11,29,58,0.3);
            padding: 36px 48px 32px;
          }
          .certificate-print, .cert-frame, .cert-frame-inner {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}
