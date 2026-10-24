/**
 * src/app/sitemap.test.ts — HEALTHY-path contract for /sitemap.xml (S3).
 *
 * The degraded path is covered by `sitemap.degraded.test.ts`. This file covers
 * the defect that survived t_0194c233: a healthy read that selected
 * `status='live'` only, ignoring `access_model`, so 96 stealth
 * `hermes-consultant` URLs were submitted to crawlers — every one a 404 for a
 * guest. ADR-217 replaced both the query and the local fallback with the
 * guest-visibility seam; this test feeds the seam a healthy `courses` fixture
 * that INCLUDES a live+granted (stealth) row and asserts it is dropped while
 * every URL of every guest-visible series survives.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { anonymousClientMock } = vi.hoisted(() => ({
  anonymousClientMock: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseAnonymousClient: () => anonymousClientMock(),
}));

import sitemap from "./sitemap";
import { learnSeries } from "@/data/learn";
import { getGuestVisibleSeries } from "@/lib/learn-visibility";
import { posts } from "@/data/posts";
import { siteConfig } from "@/lib/seo";

const VISIBLE = [
  "agentic-ai",
  "ai-at-work",
  "omni-studio-cert",
  "salesforce-architect",
];

const clientReturning = (rows: unknown[]) => ({
  from: () => ({ select: async () => ({ data: rows, error: null }) }),
});

beforeEach(() => {
  anonymousClientMock.mockReset();
  anonymousClientMock.mockResolvedValue(
    clientReturning([
      ...VISIBLE.map((series_slug) => ({
        series_slug,
        status: "live",
        access_model: "free",
      })),
      // Stealth: live but granted → invisible to a guest (would 404).
      { series_slug: "hermes-consultant", status: "live", access_model: "granted" },
      // Non-live rows are never public either.
      { series_slug: "ai-power-user", status: "pending", access_model: "free" },
    ]),
  );
});

describe("sitemap — healthy path (guest-visible only)", () => {
  it("emits no URL for a stealth or non-live series", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    const contentSlugs = learnSeries.map((s) => s.slug);
    const invisible = contentSlugs.filter((slug) => !VISIBLE.includes(slug));
    // Guard: the fixture actually contains stealth content to drop.
    expect(invisible.length).toBeGreaterThan(0);
    for (const slug of invisible) {
      expect(urls.some((u) => u.includes(`/atlas/${slug}`))).toBe(false);
    }
    expect(urls.some((u) => u.includes("hermes-consultant"))).toBe(false);
  });

  it("still emits every URL of every guest-visible series", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    const visibleSeries = await getGuestVisibleSeries();

    expect(visibleSeries.map((s) => s.slug).sort()).toEqual([...VISIBLE].sort());
    for (const series of visibleSeries) {
      // Series hub page.
      expect(urls).toContain(`${siteConfig.url}/atlas/${series.slug}`);
      // Every published lesson page.
      for (const lesson of series.lessons) {
        expect(urls).toContain(
          `${siteConfig.url}/atlas/${series.slug}/${lesson.slug}`,
        );
      }
    }
  });

  it("leaves blog and marketing URLs unchanged", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain(`${siteConfig.url}/contact`);
    expect(urls).toContain(`${siteConfig.url}${siteConfig.blogPath}`);
    for (const post of posts.slice(0, 5)) {
      expect(urls).toContain(
        `${siteConfig.url}${siteConfig.blogPath}/${post.slug}`,
      );
    }
  });

  it("does not warn on a healthy read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await sitemap();
    expect(warn).not.toHaveBeenCalled();
  });
});
