"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  getConsentState,
  grantAnalyticsConsent,
  initAnalytics,
  revokeAnalyticsConsent,
} from "@/lib/analytics";

const CONSENT_KEY = "adroit_cookie_consent";

/** Only a truly-undecided visitor sees the banner: "denied" is also the
 * default when nothing is stored, so a saved deny must stay silent. */
function isUndecided(): boolean {
  if (getConsentState() !== "denied") return false;
  return !window.localStorage.getItem(CONSENT_KEY);
}

/** Cross-tab: another tab's accept/decline hides this banner too. */
function subscribeConsent(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const HIDDEN_ON_SERVER = () => false;

/**
 * Unified cookie consent banner (merger B1). Drives GA4 consent mode: the site
 * defaults to analytics_storage: denied and gtag.js is only granted after the
 * visitor accepts here. Choice persists under localStorage
 * "adroit_cookie_consent" (contract ConsentAnalyticsApi), shared with the
 * AnalyticsInit gating so returning visitors with a saved grant do not see the
 * banner and analytics stays granted.
 */
export default function CookieConsent() {
  // Hydration-safe by construction (QA R2-4 F4). localStorage does not exist
  // during SSR, so deciding the banner in a useState initializer made the first
  // client render (banner) disagree with the server HTML (nothing): React
  // logged a mismatch and threw the server tree away. `useSyncExternalStore`
  // renders the server snapshot during hydration and switches to the real
  // value immediately after, with no setState-in-effect cascade. The banner is
  // fixed to the viewport bottom, so revealing it post-hydration shifts nothing.
  const undecided = useSyncExternalStore(
    subscribeConsent,
    isUndecided,
    HIDDEN_ON_SERVER,
  );
  const [dismissed, setDismissed] = useState(false);
  const visible = undecided && !dismissed;

  function accept() {
    grantAnalyticsConsent();
    // A first-time grant: gtag.js was not loaded yet (AnalyticsInit defers
    // loading until a decision exists), so load it now that consent is granted.
    initAnalytics();
    setDismissed(true);
  }

  function decline() {
    revokeAnalyticsConsent();
    setDismissed(true);
  }

  if (!visible) return null;

  return (
    <div
      /* Non-modal, non-blocking notice (a11y LOW L2, t_b717ec09): it is
         mounted post-hydration, so role="dialog" without aria-modal and
         without a focus move mis-described it. A labelled region is announced
         as a landmark region of the page; aria-live="polite" lets the text
         reach a screen reader that is already scanning the page. */
      role="region"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed bottom-0 inset-x-0 z-[90] border-t border-[var(--border-default)] bg-[var(--surface-card)] px-6 py-4 shadow-[var(--shadow-dialog)] sm:flex sm:items-center sm:justify-between sm:gap-6"
    >
      <p className="text-sm text-[var(--ink-muted)]">
        We use cookies to understand site usage and improve your experience.
        See our{" "}
        <Link href="/privacy" className="font-medium text-[var(--ink-primary)] underline">
          Privacy Policy
        </Link>{" "}
        for details.
      </p>
      {/* min-h-[44px]: WCAG 2.5.8 / 44x44 touch targets (a11y LOW L3,
          t_b717ec09) — px-4 py-2 text-sm alone lands at ~36 px. */}
      <div className="mt-3 flex shrink-0 gap-3 sm:mt-0">
        <button
          onClick={decline}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm font-medium text-[var(--ink-body)] transition-colors hover:bg-[var(--surface-sunken)]"
        >
          Decline
        </button>
        <button
          onClick={accept}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-[var(--surface-inverse)] px-4 py-2 text-sm font-medium text-[var(--ink-on-inverse)] transition-colors hover:bg-[var(--surface-inverse-hover)]"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
