/**
 * src/lib/learn-visibility.test.ts — tests for the guest-visibility seam
 * (ADR-217 … ADR-221, t_4b6e3daa).
 *
 * Covers: the pure row filter, the FAIL-CLOSED degradation (DB failure ⇒ the
 * static launch mirror, never every content series), the hub ordering, and the
 * card projection. `@/lib/db/server` is mocked so no Data API call is made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { anonymousClientMock } = vi.hoisted(() => ({
  anonymousClientMock: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseAnonymousClient: (...args: unknown[]) =>
    anonymousClientMock(...args),
}));

import {
  __resetLearnVisibilityWarningForTests,
  getGuestSearchDocs,
  getGuestVisibleCardSeries,
  getGuestVisibleSeries,
  getGuestVisibleSeriesSlugs,
  guestVisibleSlugsFromRows,
  isLearnVisibilityDegraded,
  type GuestVisibilityRow,
} from "@/lib/learn-visibility";
import { getAllSeries } from "@/lib/learn";
import { PUBLICLY_LAUNCHED_SERIES } from "@/lib/atlas-launch";

/** Minimal stand-in for the Data API client's `.from().select()` chain. */
function clientReturning(result: { data?: unknown; error?: unknown }) {
  return {
    from: () => ({ select: async () => result }),
  };
}

function row(
  series_slug: string,
  status: GuestVisibilityRow["status"],
  access_model: GuestVisibilityRow["access_model"],
): GuestVisibilityRow {
  return { series_slug, status, access_model };
}

beforeEach(() => {
  __resetLearnVisibilityWarningForTests();
  anonymousClientMock.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("guestVisibleSlugsFromRows (pure)", () => {
  it("is empty in, empty out", () => {
    expect(guestVisibleSlugsFromRows([]).size).toBe(0);
  });

  it("drops a live granted (stealth) row — a guest would 404 it", () => {
    const slugs = guestVisibleSlugsFromRows([
      row("hermes-consultant", "live", "granted"),
      row("salesforce-architect", "live", "free"),
    ]);
    expect(slugs.has("hermes-consultant")).toBe(false);
    expect(slugs.has("salesforce-architect")).toBe(true);
  });

  it("keeps every non-granted live model (guest sees a paywall, not a 404)", () => {
    const slugs = guestVisibleSlugsFromRows([
      row("a", "live", "free"),
      row("b", "live", "subscription"),
      row("c", "live", "one-time"),
      row("d", "live", "sub-or-one-time"),
    ]);
    expect([...slugs].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("drops pending and archived rows whatever the access model", () => {
    const slugs = guestVisibleSlugsFromRows([
      row("p-free", "pending", "free"),
      row("p-granted", "pending", "granted"),
      row("a-free", "archived", "free"),
      row("live-free", "live", "free"),
    ]);
    expect([...slugs]).toEqual(["live-free"]);
  });

  it("tolerates junk rows without inventing slugs", () => {
    const slugs = guestVisibleSlugsFromRows([
      { series_slug: "", status: "live", access_model: "free" },
      null as unknown as GuestVisibilityRow,
    ]);
    expect(slugs.size).toBe(0);
  });
});

describe("seam — healthy path", () => {
  beforeEach(() => {
    anonymousClientMock.mockResolvedValue(
      clientReturning({
        data: [
          row("salesforce-architect", "live", "free"),
          row("hermes-consultant", "live", "granted"),
          row("ai-adoption", "live", "granted"),
          row("agentic-ai", "live", "free"),
        ],
        error: null,
      }),
    );
  });

  it("returns only guest-visible slugs", async () => {
    const slugs = await getGuestVisibleSeriesSlugs();
    expect([...slugs].sort()).toEqual(["agentic-ai", "salesforce-architect"]);
    expect(await isLearnVisibilityDegraded()).toBe(false);
  });

  it("getGuestVisibleSeries drops stealth series and keeps hub order", async () => {
    const expectedOrder = getAllSeries()
      .filter((s) => s.slug === "agentic-ai" || s.slug === "salesforce-architect")
      .map((s) => s.slug);
    const series = await getGuestVisibleSeries();
    expect(series.map((s) => s.slug)).toEqual(expectedOrder);
    expect(series.some((s) => s.slug === "hermes-consultant")).toBe(false);
  });

  it("card projection carries the server-resolved shortLabel", async () => {
    const cards = await getGuestVisibleCardSeries();
    const sf = cards.find((c) => c.slug === "salesforce-architect");
    expect(sf?.shortLabel).toBe("Salesforce");
    expect(cards.some((c) => c.slug === "hermes-consultant")).toBe(false);
  });

  it("search docs contain only visible series and their lessons", async () => {
    const docs = await getGuestSearchDocs();
    expect(docs.some((d) => d.type === "post")).toBe(true);
    expect(docs.some((d) => d.href.includes("/atlas/hermes-consultant"))).toBe(
      false,
    );
    expect(docs.some((d) => d.href === "/atlas/salesforce-architect")).toBe(true);
    // Metadata only: no lesson body / section / content field anywhere.
    const allowed = new Set([
      "type",
      "title",
      "href",
      "group",
      "snippet",
      "terms",
      "meta",
    ]);
    for (const doc of docs) {
      for (const key of Object.keys(doc)) expect(allowed.has(key)).toBe(true);
    }
  });
});

describe("seam — FAIL CLOSED on failure", () => {
  it("a thrown loader degrades to the static launch mirror, not every series", async () => {
    anonymousClientMock.mockRejectedValue(new Error("token endpoint down"));

    const slugs = await getGuestVisibleSeriesSlugs();

    expect([...slugs].sort()).toEqual([...PUBLICLY_LAUNCHED_SERIES].sort());
    // Regression guard: the old fail-open fallback returned the whole dataset.
    expect(slugs.size).not.toBe(getAllSeries().length);
    expect(slugs.size).toBeLessThan(getAllSeries().length);
    expect(await isLearnVisibilityDegraded()).toBe(true);
  });

  it("a query error (no throw) degrades the same way", async () => {
    anonymousClientMock.mockResolvedValue(
      clientReturning({ data: null, error: { message: "permission denied" } }),
    );

    const slugs = await getGuestVisibleSeriesSlugs();

    expect([...slugs].sort()).toEqual([...PUBLICLY_LAUNCHED_SERIES].sort());
    expect(await isLearnVisibilityDegraded()).toBe(true);
  });

  it("warns about the degradation exactly once per process", async () => {
    anonymousClientMock.mockRejectedValue(new Error("token endpoint down"));

    await getGuestVisibleSeriesSlugs();
    await getGuestVisibleSeriesSlugs();
    await getGuestSearchDocs();

    const warns = (console.warn as unknown as { mock: { calls: unknown[][] } })
      .mock.calls.filter(
        (c) =>
          typeof c[0] === "string" && c[0].startsWith("[learn-visibility]"),
      );
    expect(warns).toHaveLength(1);
    expect(String(warns[0][0])).toContain("static launched-series mirror");
  });

  it("an empty result set is a healthy (not degraded) state", async () => {
    anonymousClientMock.mockResolvedValue(
      clientReturning({ data: [], error: null }),
    );

    expect((await getGuestVisibleSeriesSlugs()).size).toBe(0);
    expect(await isLearnVisibilityDegraded()).toBe(false);
  });
});

/*
 * Q1 of t_466b3b10, ported from PR #386's
 * `src/app/sitemap.healthy.test.ts` ("sitemap on the HEALTHY path (DB read
 * succeeds)") into the seam that now owns the rule (t_a774c0d2).
 *
 * Publication requires BOTH authorities: `slug ∈ PUBLICLY_LAUNCHED_SERIES`
 * AND (DB unreadable OR row live + non-stealth). The healthy path used to
 * return the raw DB-derived set, so a `courses` row flipped live at runtime
 * (`/admin`, no seed migration) was advertised from the sitemap, the search
 * index and the funnel while its own metadata said `noindex`.
 */
describe("seam — healthy path intersects the DB set with the static mirror", () => {
  type WarnMock = { mock: { calls: unknown[][] } };

  function learnVisibilityWarns(): string[] {
    return (console.warn as unknown as WarnMock).mock.calls
      .map((c) => c[0])
      .filter(
        (m): m is string =>
          typeof m === "string" && m.startsWith("[learn-visibility]"),
      );
  }

  it("publishes only DB-live ∩ static-launch-mirror, and warns once about drift", async () => {
    // `hermes-consultant` is a real content series that is NOT in the static
    // launch mirror. `live` + `free` proves ACCESS, so only the DISCLOSURE
    // authority (the mirror) can drop it — exactly the runtime-flip drift the
    // `/admin` course surface can create.
    anonymousClientMock.mockResolvedValue(
      clientReturning({
        data: [
          row("agentic-ai", "live", "free"),
          row("hermes-consultant", "live", "free"),
        ],
        error: null,
      }),
    );

    const slugs = await getGuestVisibleSeriesSlugs();

    // DB proves access AND mirror proves disclosure → published.
    expect(slugs.has("agentic-ai")).toBe(true);
    // In the DB but not in the mirror → NOT published, on any surface.
    expect(slugs.has("hermes-consultant")).toBe(false);
    expect(await isLearnVisibilityDegraded()).toBe(false);

    const series = await getGuestVisibleSeries();
    expect(series.map((s) => s.slug)).toEqual(["agentic-ai"]);
    const cards = await getGuestVisibleCardSeries();
    expect(cards.some((c) => c.slug === "hermes-consultant")).toBe(false);
    const docs = await getGuestSearchDocs();
    expect(
      docs.some((d) => d.href.includes("/atlas/hermes-consultant")),
    ).toBe(false);

    // Drift stays visible: exactly one warn naming the offending slug.
    const warns = learnVisibilityWarns();
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain("absent from the static launch mirror");
    expect(warns[0]).toContain("hermes-consultant");
    expect(warns[0]).not.toContain("agentic-ai");
  });

  it("mirror members the DB did not report live are not published (DB still governs access)", async () => {
    expect(PUBLICLY_LAUNCHED_SERIES).toContain("ai-at-work");
    anonymousClientMock.mockResolvedValue(
      clientReturning({
        data: [row("agentic-ai", "live", "free")],
        error: null,
      }),
    );

    const slugs = await getGuestVisibleSeriesSlugs();

    expect([...slugs]).toEqual(["agentic-ai"]);
    // A mirror member with no live row (or a pending/archived row) is out.
    expect(slugs.has("ai-at-work")).toBe(false);
    expect(slugs.has("salesforce-architect")).toBe(false);
  });

  it("does not warn when the live set is entirely inside the mirror", async () => {
    anonymousClientMock.mockResolvedValue(
      clientReturning({
        data: [row("agentic-ai", "live", "free"), row("ai-at-work", "live", "free")],
        error: null,
      }),
    );

    const slugs = await getGuestVisibleSeriesSlugs();

    expect([...slugs].sort()).toEqual(["agentic-ai", "ai-at-work"]);
    expect(learnVisibilityWarns()).toHaveLength(0);
  });

  it("stealth rows never reach the mirror check (access is decided first)", async () => {
    // live + granted is stealth: dropped by `isGuestVisibleCourse`, so it must
    // not be reported as mirror drift either.
    anonymousClientMock.mockResolvedValue(
      clientReturning({
        data: [row("salesforce-architect", "live", "free"), row("hermes-consultant", "live", "granted")],
        error: null,
      }),
    );

    expect([...(await getGuestVisibleSeriesSlugs())]).toEqual([
      "salesforce-architect",
    ]);
    expect(learnVisibilityWarns()).toHaveLength(0);
  });

  it("publishes nothing when the DB reports no live rows", async () => {
    anonymousClientMock.mockResolvedValue(
      clientReturning({ data: [], error: null }),
    );

    expect((await getGuestVisibleSeriesSlugs()).size).toBe(0);
    expect(await isLearnVisibilityDegraded()).toBe(false);
    expect(learnVisibilityWarns()).toHaveLength(0);
  });
});
