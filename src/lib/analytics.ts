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

/**
 * Routes whose URL carries a credential in the query string (single-use reset /
 * invite tokens). A page view from one of these must never forward its query
 * to a third party — GA4 keeps every `page_location` it receives — so the whole
 * query is dropped for the route rather than redacting param-by-param. New
 * credential-in-URL routes only need to be added here (F-S1, CWE-201).
 */
const CREDENTIAL_ROUTES = ["/reset-password"];

/**
 * Query params that are secret-bearing on ANY route (protocol flows such as
 * `?access_token=…`, `?code=…`, `?state=…`), stripped as defence in depth so a
 * future credential route cannot leak before it is added to CREDENTIAL_ROUTES.
 */
const SENSITIVE_PARAMS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "recovery_token",
  "password",
  "secret",
  "code",
  "state",
  "session",
  "otp",
  "sig",
  "signature",
  "api_key",
  "key",
]);

/** True when `pathname` is (or is under) a credential-bearing route. */
function isCredentialRoute(pathname: string): boolean {
  return CREDENTIAL_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Build the `page_location` value handed to GA4 — a URL that can never carry a
 * credential (F-S1).
 *
 * - Credential routes (`/reset-password`): query AND fragment are dropped, so
 *   `…/reset-password?token=abc123` reports as `…/reset-password`.
 * - Every other page keeps its full path and query (UTM/campaign attribution
 *   must not regress), minus any SENSITIVE_PARAMS entry.
 *
 * Fragments are never reported (GA4 ignores them server-side, and they are a
 * second place credentials ride in — e.g. `#access_token=…`). Falls back to
 * plain string surgery when the input is not parseable as a URL.
 */
export function safePageLocation(href: string): string {
  const stripped = href.split("#")[0].split("?")[0];

  let url: URL;
  try {
    url = new URL(href, "https://placeholder.invalid");
  } catch {
    return stripped;
  }

  const pathname = url.pathname || "/";
  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(href);
  const prefix = isAbsolute ? url.origin : "";

  if (isCredentialRoute(pathname)) return `${prefix}${pathname}`;

  const params = url.searchParams;
  for (const name of new Set(params.keys())) {
    if (SENSITIVE_PARAMS.has(name.toLowerCase())) params.delete(name);
  }
  const search = params.toString();
  return `${prefix}${pathname}${search ? `?${search}` : ""}`;
}

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
  // page_location is explicit: the gtag `config` page_view would otherwise
  // default to window.location.href, which on /reset-password is the token
  // itself (F-S1). safePageLocation drops the query for credential routes.
  window.gtag("config", GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    page_location: safePageLocation(window.location.href),
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
