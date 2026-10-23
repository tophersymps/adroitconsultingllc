/**
 * GA4 page_location redaction tests (security follow-up F-S1, CWE-201).
 *
 * `src/lib/analytics.ts` builds GA4's `page_location`. On `/reset-password` the
 * query string IS the single-use credential, so that value must never carry the
 * token to gtag (and on to Google Analytics / property exports). Attribution on
 * public pages must not regress: their path and campaign params still report.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const MEASUREMENT_ID = "G-REDACTTEST";

describe("safePageLocation", () => {
  it("drops the query for the credential route (AC1: token never reported)", async () => {
    const { safePageLocation } = await import("@/lib/analytics");

    const value = safePageLocation("https://adroit.io/reset-password?token=abc123");

    expect(value).toBe("https://adroit.io/reset-password");
    expect(value).not.toContain("abc123");
    expect(value).not.toContain("token");
  });

  it("drops the query and fragment for sub-paths of the credential route", async () => {
    const { safePageLocation } = await import("@/lib/analytics");

    expect(safePageLocation("https://adroit.io/reset-password/confirm?token=abc123#x")).toBe(
      "https://adroit.io/reset-password/confirm",
    );
  });

  it("keeps the full path and campaign query on public pages (AC2: no attribution regression)", async () => {
    const { safePageLocation } = await import("@/lib/analytics");

    expect(safePageLocation("https://adroit.io/about?utm_source=newsletter&utm_campaign=fall")).toBe(
      "https://adroit.io/about?utm_source=newsletter&utm_campaign=fall",
    );
  });

  it("keeps the homepage and bare paths intact", async () => {
    const { safePageLocation } = await import("@/lib/analytics");

    expect(safePageLocation("https://adroit.io/")).toBe("https://adroit.io/");
    expect(safePageLocation("/learn/atlas")).toBe("/learn/atlas");
  });

  it("redacts secret-bearing params on any route (defence in depth)", async () => {
    const { safePageLocation } = await import("@/lib/analytics");

    const value = safePageLocation(
      "https://adroit.io/auth/callback?code=abc123&access_token=def456&page=2",
    );

    expect(value).toBe("https://adroit.io/auth/callback?page=2");
    expect(value).not.toContain("abc123");
    expect(value).not.toContain("def456");
  });
});

describe("initAnalytics config page_location (AC1)", () => {
  beforeEach(() => {
    // GA_MEASUREMENT_ID is read at module load, so the module must be
    // re-evaluated after the ID is set (earlier imports cached it env-less).
    vi.resetModules();
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = MEASUREMENT_ID;
    delete (window as unknown as Record<string, unknown>).dataLayer;
    delete (window as unknown as Record<string, unknown>).gtag;
    document.getElementById("adroit-ga4-script")?.remove();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    window.history.replaceState({}, "", "/");
    document.getElementById("adroit-ga4-script")?.remove();
  });

  it("hands gtag a page_location with no reset token in it", async () => {
    window.history.replaceState({}, "", "/reset-password?token=abc123");

    const analytics = await import("@/lib/analytics");
    analytics.initAnalytics();

    const calls = (window.dataLayer ?? []) as unknown[][];
    const configCall = calls.find((call) => call[0] === "config");
    expect(configCall).toBeTruthy();

    const options = configCall![2] as Record<string, unknown>;
    expect(JSON.stringify(options)).not.toContain("abc123");
    expect(String(options.page_location)).toMatch(/\/reset-password$/);
  });

  it("reports the full path (with query) on a public page", async () => {
    window.history.replaceState({}, "", "/learn/atlas?utm_source=email");

    const analytics = await import("@/lib/analytics");
    analytics.initAnalytics();

    const calls = (window.dataLayer ?? []) as unknown[][];
    const configCall = calls.find((call) => call[0] === "config");
    const options = configCall![2] as Record<string, unknown>;

    expect(String(options.page_location)).toMatch(/\/learn\/atlas\?utm_source=email$/);
  });
});
