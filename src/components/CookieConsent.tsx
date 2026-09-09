"use client";

import { useState } from "react";
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
export default function CookieConsent() {
  // Lazy initializer (not an effect): show the banner only when no consent
  // decision is persisted. SSR renders nothing (no window); on the client the
  // initializer runs once at first render so no effect-driven setState is
  // needed and the banner appears for first-time / undecided visitors.
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const state = getConsentState();
    if (state !== "denied") return false;
    // "denied" is also the default when nothing is stored yet; only show the
    // banner for the truly-undecided (no stored key), not repeat deniers.
    return !window.localStorage.getItem("adroit_cookie_consent");
  });

  function accept() {
    grantAnalyticsConsent();
    // A first-time grant: gtag.js was not loaded yet (AnalyticsInit defers
    // loading until a decision exists), so load it now that consent is granted.
    initAnalytics();
    setVisible(false);
  }

  function decline() {
    revokeAnalyticsConsent();
    setVisible(false);
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
