"use client";

import { useEffect } from "react";
import { getConsentState, initAnalytics } from "@/lib/analytics";

/**
 * GA4 initializer (merger B1: consent-gated). Mounted once in the root layout.
 *
 * Consent mode: gtag.js is only loaded once the visitor has made a consent
 * decision. Returning visitors with a saved grant initialize immediately;
 * a saved deny (or an undecided visitor) loads nothing until the cookie banner
 * grants, at which point the banner calls initAnalytics. Env-gated inside
 * initAnalytics — a complete no-op until NEXT_PUBLIC_GA_MEASUREMENT_ID is set.
 */
export default function AnalyticsInit() {
  useEffect(() => {
    if (getConsentState() === "granted") {
      initAnalytics();
    }
  }, []);

  return null;
}
