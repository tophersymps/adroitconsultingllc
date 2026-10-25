/**
 * src/app/api/search/route.test.ts — payload + caching contract for the search
 * index (ADR-220, t_4b6e3daa).
 *
 * The route is the ONLY way learn documents reach a browser. These assertions
 * are the S2 regression lock: no stealth series name or slug, no lesson body,
 * a cacheable (never `no-store`) response, and a payload inside the ADR's
 * ≤200 KB raw budget.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { anonymousClientMock } = vi.hoisted(() => ({
  anonymousClientMock: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseAnonymousClient: () => anonymousClientMock(),
}));

import { GET, dynamic, revalidate } from "./route";
import type { SearchIndexResponse } from "@/shared/contracts-search";

const LIVE_FREE = [
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
      ...LIVE_FREE.map((series_slug) => ({
        series_slug,
        status: "live",
        access_model: "free",
      })),
      // Stealth rows: live but `granted` → must never reach the payload.
      { series_slug: "hermes-consultant", status: "live", access_model: "granted" },
      { series_slug: "ai-power-user", status: "live", access_model: "granted" },
      { series_slug: "ai-adoption", status: "live", access_model: "granted" },
    ]),
  );
});

async function getPayload(): Promise<{
  res: Response;
  body: SearchIndexResponse;
  raw: string;
}> {
  const res = await GET();
  const raw = await res.text();
  return { res, body: JSON.parse(raw) as SearchIndexResponse, raw };
}

describe("GET /api/search", () => {
  it("is statically prerendered with a 5-minute revalidation window", () => {
    expect(dynamic).toBe("force-static");
    expect(revalidate).toBe(300);
  });

  it("returns a versioned document envelope", async () => {
    const { res, body } = await getPayload();
    expect(res.status).toBe(200);
    expect(body.version).toBe(1);
    expect(Array.isArray(body.docs)).toBe(true);
    expect(body.docs.length).toBeGreaterThan(0);
  });

  it("is CDN-cacheable and never no-store", async () => {
    const { res } = await getPayload();
    const cacheControl = res.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("s-maxage=300");
    expect(cacheControl).not.toContain("no-store");
  });

  it("contains no stealth series slug, name or label", async () => {
    const { raw } = await getPayload();
    for (const needle of [
      "hermes-consultant",
      "ai-power-user",
      "ai-adoption",
      "Hermes Agent Consultant",
      "AI Power User",
      "AI Adoption",
      "Sharing & Visibility",
    ]) {
      expect(raw).not.toContain(needle);
    }
  });

  it("contains only body-free metadata documents", async () => {
    const { body } = await getPayload();
    const allowed = new Set([
      "type",
      "title",
      "href",
      "group",
      "snippet",
      "terms",
      "meta",
    ]);
    for (const doc of body.docs) {
      for (const key of Object.keys(doc)) expect(allowed.has(key)).toBe(true);
      expect(doc.snippet.length).toBeLessThanOrEqual(161);
    }
  });

  it("includes posts, the visible series and their lessons", async () => {
    const { body } = await getPayload();
    const hrefs = body.docs.map((d) => d.href);
    expect(hrefs.some((h) => h.startsWith("/field-notes/"))).toBe(true);
    expect(hrefs).toContain("/atlas/salesforce-architect");
    expect(
      hrefs.some((h) => h.startsWith("/atlas/salesforce-architect/")),
    ).toBe(true);
    expect(hrefs.some((h) => h.startsWith("/atlas/"))).toBe(true);
  });

  it("stays inside the 200 KB raw payload budget", async () => {
    const { raw } = await getPayload();
    expect(raw.length).toBeLessThan(200_000);
  });
});
