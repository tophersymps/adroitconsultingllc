/**
 * Analytics helper tests (backlog B-06 / D5).
 *
 * The module is env-gated on NEXT_PUBLIC_GA_MEASUREMENT_ID: with no ID it must
 * be a pure no-op (zero gtag script, zero events). With an ID it must queue the
 * config pageview and fire typed funnel events through window.gtag.
 */
import { describe, it, expect, beforeEach } from "vitest";

// Default (no ID) — module under test is fresh per test file.
import * as analytics from "@/lib/analytics";

describe("analytics (no measurement ID configured)", () => {
  beforeEach(() => {
    // Simulate env-gated OFF state.
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "";
    delete (window as unknown as Record<string, unknown>).dataLayer;
    delete (window as unknown as Record<string, unknown>).gtag;
  });

  it("is disabled when no measurement ID is set", () => {
    expect(analytics.analyticsEnabled).toBe(false);
  });

  it("initAnalytics is a safe no-op without an ID (no script injected)", () => {
    analytics.initAnalytics();
    expect(document.getElementById("adroit-ga4-script")).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });

  it("trackEvent is a safe no-op without an ID", () => {
    expect(() => analytics.trackEvent("test_event")).not.toThrow();
    expect(window.dataLayer).toBeUndefined();
  });

  it("funnel helpers are safe no-ops without an ID", () => {
    expect(() => {
      analytics.trackLessonComplete("lesson-1");
      analytics.trackQuizTierComplete({ quizName: "q", score: 90, passed: true });
      analytics.trackExamComplete({ quizName: "e", score: 80, passed: true });
      analytics.trackCertificateViewed({ series: "s", courseName: "c" });
    }).not.toThrow();
    expect(window.dataLayer).toBeUndefined();
  });
});
