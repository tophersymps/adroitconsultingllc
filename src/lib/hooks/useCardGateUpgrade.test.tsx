/**
 * useCardGateUpgrade — A11Y-M1 (t_dd870a3a) regression suite.
 *
 * The /atlas page is prerendered with the guest projection; a signed-in
 * visitor must be upgraded AFTER hydration (never during SSR — that would be
 * a hydration mismatch). These tests cover: guest stays locked, signed-in
 * upgrade merges canAccess + lessonSlugs, and every failure mode degrades to
 * the guest baseline instead of inventing a signed-in state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { applyCardGateUpgrade, useCardGateUpgrade } from "./useCardGateUpgrade";
import type { LearnCardSeries } from "@/data/types";

function card(overrides: Partial<LearnCardSeries> = {}): LearnCardSeries {
  return {
    slug: "agentic-ai",
    name: "Agentic AI",
    description: "desc",
    gradient: "g",
    lessonCount: 3,
    totalLessons: 3,
    lessonSlugs: [],
    section: null,
    group: null,
    track: null,
    level: null,
    sortOrder: 0,
    difficulty: null,
    canAccess: false,
    ...overrides,
  };
}

const stubResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("applyCardGateUpgrade", () => {
  it("merges canAccess + lessonSlugs and leaves other card fields intact", () => {
    const base = card();
    const [merged] = applyCardGateUpgrade([base], [
      { slug: "agentic-ai", canAccess: true, lessonSlugs: ["a", "b"] },
    ]);

    expect(merged).not.toBe(base);
    expect(merged.canAccess).toBe(true);
    expect(merged.lessonSlugs).toEqual(["a", "b"]);
    // Prerendered fields are untouched — the upgrade is a small delta.
    expect(merged.name).toBe("Agentic AI");
    expect(merged.description).toBe("desc");
    expect(merged.totalLessons).toBe(3);
  });

  it("keeps the static card verbatim when the series is not in the payload", () => {
    const base = card({ slug: "other" });
    const [merged] = applyCardGateUpgrade([base], [
      { slug: "agentic-ai", canAccess: true, lessonSlugs: ["a"] },
    ]);
    expect(merged).toBe(base);
  });
});

describe("useCardGateUpgrade", () => {
  it("renders the guest baseline first (SSR/hydration-stable) and upgrades after the fetch", async () => {
    let resolveFetch!: (r: Response) => void;
    globalThis.fetch = vi.fn(
      () => new Promise<Response>((res) => (resolveFetch = res)),
    ) as never;

    const { result } = renderHook(() =>
      useCardGateUpgrade([card()], "guest-locked"),
    );

    // Before the response lands: exactly the prerendered projection.
    expect(result.current.gate).toBe("guest-locked");
    expect(result.current.courses[0].lessonSlugs).toEqual([]);
    expect(result.current.isUpgrading).toBe(true);

    resolveFetch(
      stubResponse({
        gate: "signed-in",
        series: [{ slug: "agentic-ai", canAccess: true, lessonSlugs: ["l1", "l2"] }],
      }),
    );

    await waitFor(() => expect(result.current.gate).toBe("signed-in"));
    expect(result.current.courses[0].canAccess).toBe(true);
    expect(result.current.courses[0].lessonSlugs).toEqual(["l1", "l2"]);
    expect(result.current.isUpgrading).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/atlas/cards", {
      cache: "no-store",
    });
  });

  it("stays guest-locked for a guest response", async () => {
    globalThis.fetch = vi.fn(async () =>
      stubResponse({ gate: "guest-locked", series: [] }),
    ) as never;

    const { result } = renderHook(() =>
      useCardGateUpgrade([card()], "guest-locked"),
    );

    await waitFor(() => expect(result.current.isUpgrading).toBe(false));
    expect(result.current.gate).toBe("guest-locked");
    expect(result.current.courses[0].canAccess).toBe(false);
  });

  it.each([
    ["non-ok status", async () => stubResponse({ gate: "signed-in", series: [] }, false, 503)],
    ["network error", async () => Promise.reject(new Error("offline"))],
    ["malformed body", async () => stubResponse({ nonsense: true })],
  ])("degrades to the guest baseline on %s", async (_label, fetchImpl) => {
    globalThis.fetch = vi.fn(fetchImpl) as never;

    const { result } = renderHook(() =>
      useCardGateUpgrade([card()], "guest-locked"),
    );

    await waitFor(() => expect(result.current.isUpgrading).toBe(false));
    expect(result.current.gate).toBe("guest-locked");
    expect(result.current.courses[0].lessonSlugs).toEqual([]);
  });
});
