/**
 * sitemap.degraded.test.ts — R2-5 forced-429 regression for /sitemap.xml
 * (t_ffe32443, AC-11).
 *
 * The sitemap reads the live-course set as the Data API `anonymous` role. When
 * `/token/anonymous` is throttled the read cannot happen; the build must NOT
 * fail and must NOT emit an empty learn section. The contract is the
 * content-derived fallback: every content series is treated as live, and the
 * degradation is logged EXACTLY once so the outage is visible in the deploy log
 * without flooding it per URL.
 *
 * Only `fetch` is stubbed; the real sitemap function and `db/server.ts` run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import sitemap from "./sitemap";
import { learnSeries } from "@/data/learn";
import { resetAnonymousTokenCacheForTests } from "@/lib/db/anonymous-token";
import {
  applyThrottledAuthEnv,
  clearThrottledAuthEnv,
  dataApiRequests,
  installThrottledAuth,
  type CapturedRequest,
} from "@/lib/db/test-support/throttled-auth";

let captured: CapturedRequest[] = [];

beforeEach(() => {
  applyThrottledAuthEnv();
  captured = [];
  resetAnonymousTokenCacheForTests();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearThrottledAuthEnv();
});

describe("sitemap under a token-route 429 (R2-5, AC-11)", () => {
  it("still returns a full sitemap instead of throwing the build", async () => {
    captured = installThrottledAuth({ sessionUser: null });

    const entries = await sitemap();

    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    // Static marketing routes survive regardless of the outage.
    expect(entries.some((e) => e.url.endsWith("/contact"))).toBe(true);
  });

  it("falls back to the content-derived live series set", async () => {
    captured = installThrottledAuth({ sessionUser: null });

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    for (const series of learnSeries) {
      expect(urls.some((u) => u.endsWith(`/atlas/${series.slug}`))).toBe(true);
    }
  });

  it("warns about the degradation exactly once, and only about the courses read", async () => {
    captured = installThrottledAuth({ sessionUser: null });

    await sitemap();

    const warns = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const sitemapWarns = warns.filter(
      (c) => typeof c[0] === "string" && c[0].startsWith("[sitemap]"),
    );
    expect(sitemapWarns).toHaveLength(1);
    expect(String(sitemapWarns[0][0])).toContain("falling back to all content series");
  });

  it("never issues a Data API request without a token", async () => {
    captured = installThrottledAuth({ sessionUser: null });

    await sitemap();

    expect(dataApiRequests(captured)).toHaveLength(0);
  });
});
