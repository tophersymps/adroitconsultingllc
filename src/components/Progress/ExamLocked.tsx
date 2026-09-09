/**
 * ExamLocked — locked exam panel for authed users whose knowledge checks are
 * incomplete (copy deck §6, mockup-exam-locked.html).
 *
 * Server-renderable (no client state): receives per-check progress and renders
 * the unlock panel + row list. Rows link to each check page so the user can go
 * fix a failed check. Guests see GuestCTA instead (exam page server component).
 */
import Link from "next/link";
import type { CheckProgress } from "@/shared/contracts";

interface ExamLockedProps {
  series: string;
  checks: CheckProgress[];
  seriesName: string;
}

export default function ExamLocked({ series, checks, seriesName }: ExamLockedProps) {
  const passedCount = checks.filter((c) => c.passed).length;
  const total = checks.length;
  const pct = total > 0 ? Math.round((passedCount / total) * 100) : 0;

  return (
    <div className="max-w-[720px] mx-auto px-6 pt-10 pb-24">
      <div className="rounded-[20px] border border-gray-200 bg-white p-8 shadow-sm">
        {/* Lock kicker */}
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-red-dark uppercase tracking-[0.09em] mb-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Cert Prep Exam · locked
        </div>

        <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-extrabold text-navy tracking-[-0.02em] leading-tight mb-3">
          Unlock: complete all 9 knowledge checks with 80%+
        </h1>
        <p className="text-[14px] text-gray-500 max-w-[600px] leading-relaxed mb-6">
          The timed cert prep exam opens once every knowledge check is passed at 80% or higher. Pass each check, then come back to start your 105-minute run.
        </p>

        {/* Summary */}
        <div className="rounded-[14px] border border-gray-200 bg-gray-50 p-4 mb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <span className="font-mono text-[12px] font-bold text-navy">
              Checks passed {passedCount}/{total}
            </span>
            <span className="font-mono text-[10.5px] text-gray-500">
              80% required per check
            </span>
          </div>
          <div className="h-[5px] rounded-full bg-gray-200 overflow-hidden mt-3">
            <div
              className="h-full rounded-full bg-emerald transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Per-check progress list */}
        <div className="border-t border-gray-100">
          {checks.map((check) => (
            <Link
              key={check.n}
              href={`/learn/${series}/check/${check.n}`}
              className="group flex items-center gap-3 py-3.5 border-b border-gray-100 no-underline last:border-0 hover:bg-gray-50 transition-colors duration-150 rounded-lg px-1"
            >
              <span
                className={`flex-shrink-0 w-10 h-8 rounded-lg font-mono text-[11px] font-bold flex items-center justify-center transition-colors duration-150 ${
                  check.passed
                    ? "bg-emerald/15 text-emerald-800 group-hover:bg-emerald/25"
                    : "bg-gray-100 text-gray-500 group-hover:bg-navy group-hover:text-white"
                }`}
              >
                K{check.n}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-semibold text-gray-800 truncate">
                  Knowledge Check {check.n}
                </span>
              </span>
              {check.passed ? (
                <span className="font-mono text-[10.5px] font-bold text-emerald-800 bg-emerald/10 px-2.5 py-1 rounded-full">
                  Passed · {check.bestScore}%
                </span>
              ) : check.attempts > 0 ? (
                <span className="font-mono text-[10.5px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  {check.bestScore}% · 80% required
                </span>
              ) : (
                <span className="font-mono text-[10.5px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  80% required
                </span>
              )}
              <span aria-hidden="true" className="text-gray-300 text-sm group-hover:text-red group-hover:translate-x-0.5 transition-all duration-200">
                &rarr;
              </span>
            </Link>
          ))}
        </div>
      </div>

      <p className="font-mono text-[10.5px] text-gray-500 mt-4">
        {seriesName} · The gate is the list itself — pass each check to unlock the exam.
      </p>
    </div>
  );
}
