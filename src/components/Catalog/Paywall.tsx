import Link from "next/link";
import type { PaywallView } from "@/shared/contracts-course-catalog";

/**
 * Paywall — Decide/Learn locked-content surface, server-rendered with the
 * course's REAL access options (from src/lib/access.ts → PaywallView).
 * kara tokens (design-tokens-course-catalog-admin.css §4): deep-navy panel +
 * red glow + locked-row dim. Only rendered for a live course the user cannot
 * access — never for not-launched (404) or admin-preview.
 */
export default function Paywall({
  view,
  seriesSlug,
}: {
  view: PaywallView;
  seriesSlug: string;
}) {
  return (
    <div className="max-w-[720px] mx-auto px-6 pt-10 pb-16">
      <div className="paywall-panel">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 85% 10%, rgba(200,16,46,0.28) 0%, transparent 42%)",
          }}
        />
        <div className="relative p-8 sm:p-10">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-bold text-white/70 uppercase tracking-[0.08em] mb-4">
            <svg
              aria-hidden
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Members-only content
          </div>

          <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-extrabold text-white tracking-[-0.02em] leading-tight mb-3">
            {view.courseName}
          </h1>
          <p className="text-white/70 text-[15px] leading-relaxed mb-6 max-w-[480px]">
            This course is locked for you right now. Choose an access option to
            start learning in order.
          </p>

          {/* Real access options for this course's access model */}
          <ul className="space-y-2.5 mb-6">
            {view.options.map((opt) => (
              <li
                key={opt.model}
                className="flex items-center justify-between gap-4 rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3"
                style={{
                  opacity: opt.actionable ? 1 : "var(--paywall-locked-row-opacity)",
                }}
              >
                <span className="text-[14px] font-semibold text-white">
                  {opt.label}
                </span>
                {opt.actionable ? (
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--paywall-accent)]">
                    Available
                  </span>
                ) : (
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.05em] text-white/60">
                    Info
                  </span>
                )}
              </li>
            ))}
          </ul>

          {view.peekLessonSlug ? (
            <Link
              href={`/learn/${seriesSlug}/preview`}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/80 no-underline hover:text-white transition-colors min-h-[44px] px-2"
            >
              Preview first lesson
              <span aria-hidden>&rarr;</span>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
