/**
 * sitemap.degraded.test.ts — R2-5 forced-429 regression for /sitemap.xml
 * (t_ffe32443, AC-11; fail-closed contract per t_0194c233 option 1).
 *
 * The sitemap reads the live-course set as the Data API `anonymous` role. When
 * `/token/anonymous` is throttled the read cannot happen; the build must NOT
 * fail and must NOT emit an empty learn section. The contract is now FAIL
 * CLOSED (F-2, CWE-200): the learn section falls back to the static
 * `isPubliclyLaunchedSeries()` mirror — the same DB-free predicate the atlas
 * routes use on their `unavailable` path — so a deploy that lands during a
 * token outage never advertises an unpublished ("stealth") course. The
 * degradation is logged EXACTLY once so the outage is visible in the deploy log
 * without flooding it per URL.
 *
 * Only `fetch` is stubbed; the real sitemap function and `db/server.ts` run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import sitemap from "./sitemap";
import { learnSeries } from "@/data/learn";
import {
  PUBLICLY_LAUNCHED_SERIES,
  isPubliclyLaunchedSeries,
} from "@/lib/atlas-launch";
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

  it("fails CLOSED to the static launched-series mirror (no stealth slugs)", async () => {
    captured = installThrottledAuth({ sessionUser: null });

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    // Publicly launched series keep their hub URL (and their lessons/checks).
    for (const slug of PUBLICLY_LAUNCHED_SERIES) {
      expect(urls.some((u) => u.endsWith(`/atlas/${slug}`))).toBe(true);
    }

    // Unpublished series must never be advertised during an outage: this is the
    // exact F-2 leak the fail-open fallback used to publish (40 ai-adoption +
    // 96 hermes-consultant URLs measured in t_0194c233).
    const stealthSlugs = learnSeries
      .map((s) => s.slug)
      .filter((slug) => !isPubliclyLaunchedSeries(slug));
    expect(stealthSlugs.length).toBeGreaterThan(0);
    for (const slug of stealthSlugs) {
      expect(urls.some((u) => u.includes(`/atlas/${slug}`))).toBe(false);
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
    expect(String(sitemapWarns[0][0])).toContain("static launched-series mirror");
  });

  it("never issues a Data API request without a token", async () => {
    captured = installThrottledAuth({ sessionUser: null });

    await sitemap();

    expect(dataApiRequests(captured)).toHaveLength(0);
  });
});
