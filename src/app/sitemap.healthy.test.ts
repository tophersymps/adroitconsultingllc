/**
 * sitemap.healthy.test.ts — Q1 of t_466b3b10 (doctrine settled in t_0194c233).
 *
 * A series slug may be listed publicly IFF `isPubliclyLaunchedSeries(slug)` AND
 * (the DB is unreadable OR `courses.status = 'live'`). `courses.status` is the
 * authority for ACCESS, the static launch mirror (`src/lib/atlas-launch.ts`) is
 * the authority for DISCLOSURE — publication needs BOTH.
 *
 * The defect this locks down: the healthy path used the raw DB live set
 * (`liveSlugs ?? <mirror set>`), so a `courses` row flipped to `live` at runtime
 * through the `/admin` course surface (bypassing the seed migration the mirror
 * is asserted against) was listed in /sitemap.xml while its own
 * `generateMetadata` emitted the generic `noindex` title. Google was handed an
 * indexable URL whose head says "do not index", and an unpublished series was
 * advertised from the most crawler-visible surface on the site.
 *
 * The DB read is stubbed directly (`@/lib/db/server`) — the throttled-auth
 * harness belongs to the OUTAGE path (sitemap.degraded.test.ts) and must not be
 * reused here, where the read succeeds.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const eq = vi.fn();
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { mocks: { from, select, eq } };
});

vi.mock("@/lib/db/server", () => ({
  getSupabaseAnonymousClient: async () => ({ from: mocks.from }),
}));

import sitemap from "./sitemap";

type WarnMock = { mock: { calls: unknown[][] } };

function sitemapWarns(): string[] {
  return (console.warn as unknown as WarnMock).mock.calls
    .map((c) => c[0])
    .filter((m): m is string => typeof m === "string" && m.startsWith("[sitemap]"));
}

beforeEach(() => {
  mocks.from.mockClear();
  mocks.select.mockClear();
  mocks.eq.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sitemap on the HEALTHY path (DB read succeeds)", () => {
  it("lists only DB-live ∩ static-launch-mirror, and warns once about drift", async () => {
    // `hermes-consultant` is a real content series that is NOT in the static
    // launch mirror (stealth). A live DB row for it is exactly the runtime-flip
    // drift the `/admin` course surface can create.
    mocks.eq.mockResolvedValue({
      data: [
        { series_slug: "agentic-ai" },
        { series_slug: "hermes-consultant" },
      ],
      error: null,
    });

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    // The DB row proves access AND the mirror proves disclosure → listed.
    expect(urls.some((u) => u.endsWith("/atlas/agentic-ai"))).toBe(true);
    // Its lessons are listed too (access is proven for the whole series).
    expect(urls.some((u) => u.includes("/atlas/agentic-ai/"))).toBe(true);

    // Not in the mirror → NOTHING about it may appear: no hub, lesson, check or
    // exam URL of any kind.
    expect(urls.some((u) => u.includes("/atlas/hermes-consultant"))).toBe(false);

    // Mirror members the DB did NOT report live are not listed either (the
    // intersection is symmetric — DB status still governs access).
    expect(urls.some((u) => u.includes("/atlas/ai-at-work"))).toBe(false);

    // Drift is visible: exactly one [sitemap] warn, naming the offending slug.
    const warns = sitemapWarns();
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain("absent from the static launch mirror");
    expect(warns[0]).toContain("hermes-consultant");
    expect(warns[0]).not.toContain("agentic-ai");
  });

  it("does not warn when the live set is entirely inside the mirror", async () => {
    mocks.eq.mockResolvedValue({
      data: [{ series_slug: "agentic-ai" }, { series_slug: "ai-at-work" }],
      error: null,
    });

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls.some((u) => u.endsWith("/atlas/agentic-ai"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/atlas/ai-at-work"))).toBe(true);
    expect(sitemapWarns()).toHaveLength(0);
  });

  it("still fails closed when the DB read reports no live rows", async () => {
    mocks.eq.mockResolvedValue({ data: [], error: null });

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls.some((u) => u.includes("/atlas/"))).toBe(false);
    expect(sitemapWarns()).toHaveLength(0);
  });
});
