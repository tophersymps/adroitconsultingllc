/**
 * src/lib/learn-visibility.test.ts — tests for the guest-visibility seam
 * (ADR-217 … ADR-221, t_4b6e3daa).
 *
 * Covers: the pure row filter, the healthy path (the DB is the sole DISCLOSURE
 * authority — t_47183b5b), the FAIL-CLOSED degradation (DB failure ⇒ the static
 * launch snapshot, never every content series), the hub ordering, and the card
 * projection. `@/lib/db/server` is mocked so no Data API call is made.
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
 * t_47183b5b replaced the two-authority rule (DB ∩ static mirror) with a single
 * DISCLOSURE authority: whenever the `courses` read succeeds, the DB verdict
 * decides — a series is published IFF a guest can resolve it (row live +
 * non-stealth). The static mirror is consulted only when the read FAILS. The
 * old intersection could only drop NON-stealth rows, which is how every
 * `/admin` launch since t_b4c0da5f silently became undiscoverable.
 */
describe("seam — healthy path discloses the DB guest-visible set", () => {
  type WarnMock = { mock: { calls: unknown[][] } };

  function learnVisibilityWarns(): string[] {
    return (console.warn as unknown as WarnMock).mock.calls
      .map((c) => c[0])
      .filter(
        (m): m is string =>
          typeof m === "string" && m.startsWith("[learn-visibility]"),
      );
  }

  it("publishes a DB-live non-stealth series that is absent from the snapshot, and warns nothing", async () => {
    // `hermes-consultant` is a real content series that is NOT in the static
    // launch snapshot. `live` + `free` proves ACCESS, so it must now be
    // disclosed: the snapshot no longer suppresses the healthy path.
    // `live` + `granted` (stealth) must still be hidden — access decides first.
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

    expect(slugs.has("agentic-ai")).toBe(true);
    expect(slugs.has("hermes-consultant")).toBe(true);
    expect(await isLearnVisibilityDegraded()).toBe(false);

    const series = await getGuestVisibleSeries();
    expect(series.map((s) => s.slug).sort()).toEqual([
      "agentic-ai",
      "hermes-consultant",
    ]);
    const cards = await getGuestVisibleCardSeries();
    expect(cards.some((c) => c.slug === "hermes-consultant")).toBe(true);
    const docs = await getGuestSearchDocs();
    expect(docs.some((d) => d.href.includes("/atlas/hermes-consultant"))).toBe(
      true,
    );

    // Drift is gone: there is nothing to warn about any more.
    expect(learnVisibilityWarns()).toHaveLength(0);
  });

  it("still hides a live granted (stealth) series, in and out of the snapshot — t_47183b5b", async () => {
    anonymousClientMock.mockResolvedValue(
      clientReturning({
        data: [
          // In the snapshot, but stealth: the DB hides it.
          row("agentic-ai", "live", "granted"),
          // Never in the snapshot, and stealth: still hidden.
          row("hermes-consultant", "live", "granted"),
          // Non-stealth control.
          row("salesforce-architect", "live", "free"),
        ],
        error: null,
      }),
    );

    const slugs = await getGuestVisibleSeriesSlugs();

    expect([...slugs]).toEqual(["salesforce-architect"]);
    expect(learnVisibilityWarns()).toHaveLength(0);
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

  it("warns nothing for either an inside- or outside-snapshot live set", async () => {
    anonymousClientMock.mockResolvedValue(
      clientReturning({
        data: [row("agentic-ai", "live", "free"), row("ai-at-work", "live", "free")],
        error: null,
      }),
    );

    expect([...(await getGuestVisibleSeriesSlugs())].sort()).toEqual([
      "agentic-ai",
      "ai-at-work",
    ]);
    expect(learnVisibilityWarns()).toHaveLength(0);

    // Same outcome when the live set is entirely outside the snapshot.
    anonymousClientMock.mockResolvedValue(
      clientReturning({
        data: [
          row("ai-adoption", "live", "sub-or-one-time"),
          row("sf-data360-consultant", "live", "subscription"),
        ],
        error: null,
      }),
    );

    expect([...(await getGuestVisibleSeriesSlugs())].sort()).toEqual([
      "ai-adoption",
      "sf-data360-consultant",
    ]);
    expect(learnVisibilityWarns()).toHaveLength(0);
  });

  it("an /admin-launched series (DB live, non-stealth) is disclosed with no warning — t_47183b5b", async () => {
    // The structural recurrence guard: a launch through `/admin` writes
    // `status='live'` to the DB only. It is discoverable with no code change.
    anonymousClientMock.mockResolvedValue(
      clientReturning({
        data: [row("ai-adoption", "live", "sub-or-one-time")],
        error: null,
      }),
    );
    const slugs = await getGuestVisibleSeriesSlugs();
    expect(slugs.has("ai-adoption")).toBe(true);
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
