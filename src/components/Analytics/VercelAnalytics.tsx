"use client";

import { useSyncExternalStore } from "react";
import { Analytics } from "@vercel/analytics/next";
import { CONSENT_CHANGE_EVENT, getConsentState } from "@/lib/analytics";

/**
 * Vercel Web Analytics, consent-gated (merger B1 contract).
 *
 * `<Analytics />` mounts its queue and sends pageviews the moment it renders,
 * so rendering it unconditionally would measure visitors before the cookie
 * banner decision — contradicting the GA4 consent mode the site already
 * ships (src/lib/analytics.ts defaults analytics_storage to denied). This
 * wrapper renders nothing until consent is granted, and re-renders on the
 * same-tab Accept click.
 *
 * The script and beacon are same-origin (`/_vercel/insights/script.js`,
 * `/_vercel/insights/view`), so the existing `script-src 'self'` /
 * `connect-src 'self'` CSP needs no change. Off Vercel the script 404s and the
 * component is inert.
 */

/** Same-tab signal (custom event) plus cross-tab signal (storage event). */
function subscribeConsent(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
  };
}

function isGranted(): boolean {
  return getConsentState() === "granted";
}

/**
 * Server + hydration snapshot: never granted. localStorage does not exist
 * during SSR, so reading it in an initializer would make the first client
 * render disagree with the server HTML (the mismatch CookieConsent avoided
 * with the same pattern, QA R2-4 F4). `useSyncExternalStore` switches to the
 * real value immediately after hydration, and this component renders
 * nothing, so there is no layout to shift.
 */
const NOT_GRANTED_ON_SERVER = () => false;

export default function VercelAnalytics() {
  const granted = useSyncExternalStore(
    subscribeConsent,
    isGranted,
    NOT_GRANTED_ON_SERVER,
  );

  if (!granted) return null;

  return <Analytics />;
}