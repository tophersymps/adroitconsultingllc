/**
 * GA4 analytics helper (backlog B-06 / USER DECISION D5).
 *
 * Env-gated: nothing loads or fires until `NEXT_PUBLIC_GA_MEASUREMENT_ID` is
 * set (e.g. "G-XXXXXXXXXX") in the deploy env. Until then every function is a
 * safe no-op, so the site stays unmeasurable-by-default exactly as the backlog
 * notes ("Site is currently unmeasurable") — wiring only activates once an ID
 * is supplied.
 *
 * The loader is client-only: it injects the official gtag.js script on first
 * mount and tracks a `window.dataLayer`. All analytics calls must be made from
 * client components (never server components / route handlers).
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Reads the measurement ID at module load (browser-safe). */
export const GA_MEASUREMENT_ID =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
    ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
    : null;

/** True when a measurement ID is configured and analytics is live. */
export const analyticsEnabled = Boolean(GA_MEASUREMENT_ID);

const SCRIPT_ID = "adroit-ga4-script";

/** Consent-gating storage key (merger contract ConsentAnalyticsApi). */
export const CONSENT_STORAGE_KEY = "adroit_cookie_consent";
export type ConsentState = "granted" | "denied";

/** Read the persisted consent state (defaults to denied / unset). */
export function getConsentState(): ConsentState {
  if (typeof window === "undefined") return "denied";
  const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  return raw === "granted" ? "granted" : "denied";
}

/**
 * Initialize GA4 — inject the gtag.js script and send the config pageview,
 * gated on consent (merger B1: consent-gated GA4, kara CookieConsent contract).
 * The site defaults to analytics_storage: denied; the script only loads after
 * the user grants via the cookie banner (localStorage "adroit_cookie_consent").
 * Safe to call more than once (idempotent via an injected marker attribute).
 */
export function initAnalytics(): void {
  if (!GA_MEASUREMENT_ID || typeof window === "undefined") return;
  if (document.getElementById(SCRIPT_ID)) return;

  // Establish dataLayer + queued gtag stub BEFORE the script loads so any
  // events fired in the same tick are queued, per GA4's official snippet.
  window.dataLayer = window.dataLayer || [];
  window.gtag = function (...args: unknown[]) {
    window.dataLayer!.push(args);
  };

  window.gtag("js", new Date());
  // Consent default is denied until the banner grants it. Persisted grant
  // (e.g. returning visitor) is re-applied after gtag exists.
  window.gtag("consent", "default", { analytics_storage: "denied" });
  if (getConsentState() === "granted") {
    window.gtag("consent", "update", { analytics_storage: "granted" });
  }
  window.gtag("config", GA_MEASUREMENT_ID, {
    anonymize_ip: true,
  });

  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

/** Grant analytics consent (drives GA4 consent mode + persists the choice). */
export function grantAnalyticsConsent(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
  if (typeof window.gtag === "function") {
    window.gtag("consent", "update", { analytics_storage: "granted" });
  }
}

/** Revoke analytics consent. */
export function revokeAnalyticsConsent(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_STORAGE_KEY, "denied");
  if (typeof window.gtag === "function") {
    window.gtag("consent", "update", { analytics_storage: "denied" });
  }
}

/**
 * Fire a GA4 custom event. No-op when analytics is disabled or gtag hasn't
 * initialised yet (events fired before the stub is up are dropped — acceptable
 * for funnel telemetry).
 */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!analyticsEnabled || typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, params ?? {});
}

/**
 * Typed funnel-event helpers (backlog B-06: lesson → quiz tier → exam →
 * certificate; aligns with Constellations). Kept as named functions so call
 * sites read as intent and event names stay consistent.
 */

/** A single lesson was marked complete. */
export function trackLessonComplete(slug: string): void {
  trackEvent("lesson_complete", { lesson_slug: slug });
}

/** A quiz tier was completed (score >= pass threshold). */
export function trackQuizTierComplete(params: {
  quizName: string;
  score: number;
  passed: boolean;
}): void {
  trackEvent("quiz_tier_complete", {
    quiz_name: params.quizName,
    score: params.score,
    passed: params.passed,
  });
}

/** An exam was submitted (pass/fail + score). */
export function trackExamComplete(params: {
  quizName: string;
  score: number;
  passed: boolean;
}): void {
  trackEvent("exam_complete", {
    quiz_name: params.quizName,
    score: params.score,
    passed: params.passed,
  });
}

/** A certificate was viewed by an eligible learner. */
export function trackCertificateViewed(params: {
  series: string;
  courseName: string;
}): void {
  trackEvent("certificate_viewed", {
    series: params.series,
    course_name: params.courseName,
  });
}
