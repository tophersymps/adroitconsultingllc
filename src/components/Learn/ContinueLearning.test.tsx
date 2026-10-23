/**
 * ContinueLearning — the shelf never collapses (PERF-MEDIUM-1 / t_bbc735da).
 *
 * The section renders ABOVE the /atlas card grid inside a fixed reservation
 * (`min-h-[208px] md:min-h-[112px]`, measured in a real browser by 987d4bf6 and
 * re-measured by t_92956e91). Two regressions are locked here:
 *
 *   1. the slot is filled on the FIRST paint (the prerendered start strip), so
 *      hydration cannot insert a section above the grid, and
 *   2. it is STILL filled when the read resolves to `[]` / fails, so the
 *      catalogue cannot collapse upward afterwards.
 *
 * The old implementation shipped a pulsing skeleton for (1) and `null` for (2);
 * both are gone. Tests assert the start strip by its copy + CTA instead of the
 * removed `continue-learning-placeholder*` test ids.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ContinueLearning from "./ContinueLearning";

const ITEM = {
  seriesSlug: "series-1",
  seriesName: "Salesforce Certified Administrator Path",
  gradient: "from-navy to-navy-light",
  nextLessonSlug: "series-1-2",
  nextLessonTitle: "Introduction to Salesforce Objects",
  totalLessons: 12,
  completedCount: 3,
  percent: 25,
  lastCompletedAt: "2026-10-20T10:00:00.000Z",
};

const FIRST_TRACK = { slug: "series-1", name: "Salesforce Certified Administrator Path" };

/** Fetch double whose response only settles when the test says so. */
function deferredFetch() {
  let release!: (body: unknown, ok?: boolean) => void;
  const pending = new Promise<{ body: unknown; ok: boolean }>((resolve) => {
    release = (body, ok = true) => resolve({ body, ok });
  });
  globalThis.fetch = vi.fn(async () => {
    const { body, ok } = await pending;
    return { ok, json: async () => body } as unknown as Response;
  }) as never;
  return release;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** The reserved-height utility both states must share. */
const RESERVE = "min-h-[208px] md:min-h-[112px]";

describe("ContinueLearning start strip — the slot never collapses", () => {
  it("renders the start strip on the first paint, before the read settles", () => {
    deferredFetch();
    render(<ContinueLearning firstTrack={FIRST_TRACK} />);

    const strip = screen.getByTestId("continue-learning-start");
    expect(strip.className).toContain(RESERVE);
    // Same frame as the resume card (radius/border/shadow/margins), so the
    // section occupies exactly the space the card will occupy.
    expect(strip.className).toContain("rounded-[20px]");
    expect(strip.className).toContain("mb-3");
    expect(strip.className).toContain("last:mb-0");

    // Copy is the real, indexable first paint — not a skeleton.
    expect(screen.getByText("Continue learning")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Start with Salesforce Certified Administrator Path" }),
    ).toBeTruthy();
    expect(screen.getByText("Tracks are read in order. Open lesson 1 to begin.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /start track/i })).toHaveAttribute(
      "href",
      "/atlas/series-1",
    );

    // Nothing claims to be loading, and no shimmer ships.
    const region = screen.getByRole("region", { name: /continue learning/i });
    expect(region).not.toHaveAttribute("aria-busy");
    expect(region.querySelector(".animate-pulse")).toBeNull();
    expect(strip.querySelector(".animate-pulse")).toBeNull();
    expect(region.querySelector(".continue-fade")).toBeNull();
  });

  it("keeps the start strip when the read resolves to no in-progress series", async () => {
    const release = deferredFetch();
    render(<ContinueLearning firstTrack={FIRST_TRACK} />);

    release({ items: [] });

    // The collapse this task exists to delete: `items.length === 0 → null`.
    await waitFor(() =>
      expect(
        screen.getByTestId("continue-learning-start").parentElement!.className,
      ).toContain("continue-fade"),
    );
    const strip = screen.getByTestId("continue-learning-start");
    expect(strip.className).toContain(RESERVE);
    expect(strip.className).toContain("rounded-[20px]");
    expect(screen.getByRole("link", { name: /start track/i })).toHaveAttribute(
      "href",
      "/atlas/series-1",
    );
    expect(screen.queryByRole("link", { name: /resume lesson/i })).toBeNull();
  });

  it("renders the resume card in the same reserved height once the read lands", async () => {
    const release = deferredFetch();
    render(<ContinueLearning firstTrack={FIRST_TRACK} />);

    release({ items: [ITEM] });

    const link = await screen.findByRole("link", { name: /resume lesson/i });
    expect(link).toHaveAttribute("href", "/atlas/series-1/series-1-2");

    const card = link.closest("[data-card]")!;
    expect(card.className).toContain(RESERVE);
    expect(card.className).toContain("rounded-[20px]");
    expect(card.className).toContain("mb-3");
    expect(card.className).toContain("last:mb-0");

    // The strip swapped out — the card took its space, not its space plus more.
    expect(screen.queryByTestId("continue-learning-start")).toBeNull();
    expect(
      screen.getByText(/3 of 12 lessons complete · next: Introduction to Salesforce Objects/),
    ).toBeTruthy();
    // The pulse dot is a live-data signal: present only on the resume card.
    expect(card.querySelector(".animate-pulse")).not.toBeNull();
    expect(screen.getByRole("region", { name: /continue learning/i })).not.toHaveAttribute(
      "aria-busy",
    );
  });

  it("keeps the start strip when the read fails", async () => {
    const release = deferredFetch();
    render(<ContinueLearning firstTrack={FIRST_TRACK} />);
    expect(screen.getByTestId("continue-learning-start")).toBeTruthy();

    release({}, false);

    await waitFor(() =>
      expect(
        screen.getByTestId("continue-learning-start").parentElement!.className,
      ).toContain("continue-fade"),
    );
    expect(screen.getByRole("link", { name: /start track/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /resume lesson/i })).toBeNull();
  });

  it("keeps the start strip when the request rejects", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as never;
    render(<ContinueLearning firstTrack={FIRST_TRACK} />);

    await waitFor(() =>
      expect(
        screen.getByTestId("continue-learning-start").parentElement!.className,
      ).toContain("continue-fade"),
    );
    expect(screen.getByRole("heading", { name: /start with/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /start track/i })).toBeTruthy();
  });

  it("falls back to Variant A copy and the section anchor when no track is known", () => {
    deferredFetch();
    render(<ContinueLearning browseHref="#section-certifications" />);

    expect(screen.getByRole("heading", { name: "Start with any track below" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /browse tracks/i })).toHaveAttribute(
      "href",
      "#section-certifications",
    );
    expect(screen.getByTestId("continue-learning-start").className).toContain(RESERVE);
  });

  it("draws the shared rail empty (0%, no gradient) in the start state", () => {
    deferredFetch();
    render(<ContinueLearning firstTrack={FIRST_TRACK} />);

    const strip = screen.getByTestId("continue-learning-start");
    const fill = strip.querySelector('[aria-hidden="true"] > div') as HTMLElement;
    expect(fill.style.width).toBe("0%");
    expect(fill.style.background).toBe("");
    // No red radial glow — that is the live-data signal.
    expect(strip.innerHTML).not.toContain("radial-gradient");
  });
});
