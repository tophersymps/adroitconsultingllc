"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  getConsentState,
  grantAnalyticsConsent,
  initAnalytics,
  revokeAnalyticsConsent,
} from "@/lib/analytics";

/**
 * Unified cookie consent banner (merger B1). Drives GA4 consent mode: the site
 * defaults to analytics_storage: denied and gtag.js is only granted after the
 * visitor accepts here. Choice persists under localStorage
 * "adroit_cookie_consent" (contract ConsentAnalyticsApi), shared with the
 * AnalyticsInit gating so returning visitors with a saved grant do not see the
 * banner and analytics stays granted.
 */
const CONSENT_KEY = "adroit_cookie_consent";

/**
 * Undecided-visitor predicate. `denied` is ALSO the default when nothing is
 * stored, so the banner only shows for the truly-undecided (no stored key) —
 * repeat deniers are not nagged.
 */
function needsConsentDecision(): boolean {
  if (getConsentState() !== "denied") return false;
  return !window.localStorage.getItem(CONSENT_KEY);
}

/** localStorage never emits events here; the value only changes via our CTA. */
function subscribeToConsent(): () => void {
  return () => {};
}

/**
 * Hydration safety (t_80131e31): the banner is decided from localStorage, which
 * the server cannot read. Resolving that in a lazy `useState` initializer made
 * the client's FIRST render differ from the server's (empty) markup — a React
 * hydration mismatch (#418) on every page for first-time visitors.
 *
 * `useSyncExternalStore` is the supported way to read an external store with a
 * distinct server snapshot: React renders `getServerSnapshot` (false → nothing)
 * during SSR *and* hydration, then re-reads the client snapshot and re-renders,
 * so the banner appears immediately after hydration with no mismatch.
 */
export default function CookieConsent() {
  const [dismissed, setDismissed] = useState(false);
  const needsDecision = useSyncExternalStore(
    subscribeToConsent,
    needsConsentDecision,
    () => false,
  );
  const visible = needsDecision && !dismissed;

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
      role="dialog"
      aria-label="Cookie consent"
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
      <div className="mt-3 flex shrink-0 gap-3 sm:mt-0">
        <button
          onClick={decline}
          className="rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm font-medium text-[var(--ink-body)] transition-colors hover:bg-[var(--surface-sunken)]"
        >
          Decline
        </button>
        <button
          onClick={accept}
          className="rounded-lg bg-[var(--surface-inverse)] px-4 py-2 text-sm font-medium text-[var(--ink-on-inverse)] transition-colors hover:bg-[var(--surface-inverse-hover)]"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
