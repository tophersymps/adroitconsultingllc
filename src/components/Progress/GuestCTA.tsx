/**
 * GuestCTA — sign-up placeholder shown to logged-out users on quiz-tier pages.
 *
 * Exact copy from design/copy-deck-quiz-tiers.md §5 (kara). The headline is
 * identical across all tiers; only the kicker, benefit line, and body change.
 * Semantics: container is a <section aria-label="...locked"> — ZERO question
 * text appears in the HTML for guests.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type GuestCtaTier = "lesson" | "check" | "exam" | "certificate";

const COPY: Record<
  GuestCtaTier,
  {
    ariaLabel: string;
    kicker: string;
    benefit: string;
    body: string;
  }
> = {
  lesson: {
    ariaLabel: "Practice questions locked",
    kicker: "Quiz · locked for guests",
    benefit: "3 questions per lesson · knowledge checks · timed exam · certificate",
    body: "Your answers, best scores, and lesson progress are saved to your account so you can pick up right where you left off — on any device.",
  },
  check: {
    ariaLabel: "Knowledge check locked",
    kicker: "Knowledge Check · locked for guests",
    benefit: "15 questions per check · 9 checks · 80% to pass",
    body: "Pass each 15-question check with 80%+ to work toward unlocking the timed cert prep exam.",
  },
  exam: {
    ariaLabel: "Cert prep exam locked",
    kicker: "Cert Prep Exam · locked for guests",
    benefit: "60 questions · 105 minutes · pass ≥ 72% · certificate",
    body: "Take the timed 60-question exam when all 9 knowledge checks are passed, and earn your printable certificate of completion.",
  },
  certificate: {
    ariaLabel: "Certificate locked",
    kicker: "Certificate · locked for guests",
    benefit: "complete all 46 lessons · pass the exam",
    body: "Earn your printable certificate of completion by finishing every lesson and passing the timed cert prep exam.",
  },
};

interface GuestCTAProps {
  tier: GuestCtaTier;
  /** The full headline, e.g. "Practice questions locked" — used for the aria-label. */
  ariaLabel?: string;
}

export default function GuestCTA({ tier, ariaLabel }: GuestCTAProps) {
  const pathname = usePathname();
  const copy = COPY[tier];
  const next = encodeURIComponent(pathname ?? "/learn");
  const loginHref = `/login?next=${next}`;

  return (
    <section aria-label={ariaLabel ?? copy.ariaLabel}>
      {/* a11y (finding 8): no role="note" — the section aria-label already
          names the region; the card is plain content, not a note. */}
      <div className="max-w-[640px] rounded-[20px] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex items-start gap-4">
          {/* Lock glyph */}
          <div
            aria-hidden="true"
            className="flex-shrink-0 w-11 h-11 rounded-xl bg-navy/[0.04] text-navy flex items-center justify-center"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-red uppercase tracking-[0.08em] mb-1.5">
              <span className="w-[3px] h-3 rounded-sm bg-red" />
              {copy.kicker}
            </div>
            <h2 className="text-[17px] font-bold text-navy leading-snug mb-2">
              Test what you learned and track your progress by creating an account and logging in!
            </h2>
            <p className="text-[13.5px] text-gray-500 leading-relaxed mb-3">{copy.body}</p>
            <div className="font-mono text-[11px] font-semibold text-gray-500 mb-4">
              {copy.benefit}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={loginHref}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-navy text-white text-[13.5px] font-bold no-underline hover:bg-navy-light active:scale-[0.98] transition-all duration-150"
              >
                Create an account
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <Link
                href={loginHref}
                className="text-[13.5px] font-bold text-navy no-underline underline-offset-4 decoration-2 decoration-red/40 hover:text-red transition-colors duration-150"
              >
                Log in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
