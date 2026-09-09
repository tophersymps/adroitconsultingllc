/**
 * DraftLocked — auth-gate card for /preview/* (draft-state t_e1c8239e).
 *
 * Renders at HTTP 200 (not 404, not bare redirect). Reuses GuestCTA anatomy:
 * navy lock glyph + mono red kicker + headline + body + CTA. Two copy tiers:
 * - signed-out → "Sign in to preview drafts" + /login?next=<full preview path>
 * - no-access  → BA copy "This content is not yet available" + mailto (no fake button)
 *
 * Server-side check (getSupabaseServerClient + isPreviewEmailAllowed) is what
 * blocks content — this card is the visitor-facing explanation only.
 *
 * Semantics: <section aria-label="Preview locked">; CTA is a real <a>; the
 * glyph is aria-hidden.
 */
import Link from "next/link";
import { sanitizeRedirectPath } from "@/lib/redirect";

interface DraftLockedProps {
  state: "signed-out" | "no-access";
  /** Full preview path (e.g. /preview/blog/<slug>) for the login echo-back. */
  nextPath?: string;
}

const COPY = {
  "signed-out": {
    ariaLabel: "Preview locked - sign in",
    kicker: "Preview · signed out",
    headline: "Sign in to preview drafts",
    body: "Draft content is only visible to authorized editors. Sign in with your Adroit account to open this preview - your access is checked automatically.",
    note: "Keep your place after login",
    ctaLabel: "Sign in",
    href: (next: string) => `/login?next=${encodeURIComponent(sanitizeRedirectPath(next))}`,
  },
  "no-access": {
    ariaLabel: "Preview locked - no access",
    kicker: "Preview · no access",
    headline: "This content is not yet available",
    body: "You're signed in, but this draft hasn't been shared with your account yet. It will appear here once it's published - or contact the team if you believe you should have access.",
    note: "Server-side check",
    ctaLabel: "Contact the team",
    href: () =>
      "mailto:hello@adroit.io?subject=Draft%20preview%20access",
  },
} as const;

export default function DraftLocked({ state, nextPath = "/blog" }: DraftLockedProps) {
  const copy = COPY[state];
  const href = copy.href(nextPath);

  return (
    <section aria-label={copy.ariaLabel} className="draft-locked">
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
              <span className="w-[3px] h-3 rounded-sm bg-red" aria-hidden="true" />
              {copy.kicker}
            </div>
            <h2 className="text-[17px] font-bold text-navy leading-snug mb-2">
              {copy.headline}
            </h2>
            <p className="text-[13.5px] text-gray-500 leading-relaxed mb-3">
              {copy.body}
            </p>
            <div className="font-mono text-[11px] font-semibold text-gray-500 mb-4">
              {copy.note}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={href}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-navy text-white text-[13.5px] font-bold no-underline hover:bg-navy-light active:scale-[0.98] transition-all duration-150"
              >
                {copy.ctaLabel}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
