/**
 * The queue format gtag.js actually reads.
 *
 * Regression guard for a silent failure: the stub used to push a rest-args
 * Array (`push(args)`), which gtag.js discards. Everything looked healthy —
 * the script loaded, google_tag_manager held the container, dataLayer carried
 * the config — and no hit ever left the browser. Only `arguments` is processed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const SCRIPT_ID = "adroit-ga4-script";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-QUEUETEST");
  window.localStorage.setItem("adroit_cookie_consent", "granted");
  delete (window as unknown as Record<string, unknown>).dataLayer;
  delete (window as unknown as Record<string, unknown>).gtag;
  document.getElementById(SCRIPT_ID)?.remove();
});

afterEach(() => {
  vi.unstubAllEnvs();
  document.getElementById(SCRIPT_ID)?.remove();
});

describe("initAnalytics queue format", () => {
  it("queues array-like commands, never real Arrays", async () => {
    const analytics = await import("@/lib/analytics");
    analytics.initAnalytics();

    const queued = (window as unknown as { dataLayer: unknown[] }).dataLayer;
    expect(queued.length).toBeGreaterThan(0);
    for (const entry of queued) {
      // gtag.js reads `arguments`; Array.isArray(entry) is the broken shape.
      expect(Array.isArray(entry)).toBe(false);
      expect((entry as { length: number }).length).toBeGreaterThan(0);
    }
  });

  it("emits consent default before js and config", async () => {
    const analytics = await import("@/lib/analytics");
    analytics.initAnalytics();

    const queued = (
      window as unknown as { dataLayer: ArrayLike<unknown> & { [n: number]: unknown[] } }
    ).dataLayer;
    expect(queued[0][0]).toBe("consent");
    expect(queued[0][1]).toBe("default");
    expect((queued[0][2] as { analytics_storage: string }).analytics_storage).toBe(
      "granted",
    );
    expect(queued[1][0]).toBe("js");
    expect(queued[queued.length - 1][0]).toBe("config");
  });
});