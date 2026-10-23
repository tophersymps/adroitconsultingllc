/**
 * ContinueLearning — reserved-height contract (PERF-MEDIUM-1, t_ea10119b).
 *
 * The section renders ABOVE the /atlas card grid. It used to return `null`
 * while `GET /api/continue-learning` was in flight, so for a signed-in visitor
 * with an in-progress series the whole section was inserted after hydration and
 * pushed every card row down ~160-190px (the dominant remaining CLS on the
 * route after #371 fixed the card footers).
 *
 * These tests pin the structural half of the fix:
 *   - pending state renders a placeholder at the SAME reserved height classes
 *     as the real resume card (one card's space, no insertion)
 *   - the resolved card carries that same reservation, so it cannot grow past
 *     the placeholder either
 *   - empty / failed reads still render nothing (`null`), as before
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

describe("ContinueLearning reserved height (PERF-MEDIUM-1)", () => {
  it("reserves one card's height while the read is in flight", () => {
    deferredFetch();
    render(<ContinueLearning />);

    const placeholder = screen.getByTestId("continue-learning-placeholder-card");
    expect(placeholder.className).toContain(RESERVE);
    // Same frame as the card (radius/border/shadow/margins), so the section
    // occupies exactly the space the card will occupy.
    expect(placeholder.className).toContain("rounded-[20px]");
    expect(placeholder.className).toContain("mb-3");
    expect(placeholder.className).toContain("last:mb-0");
    // Not announced as content; the section itself is busy.
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("region", { name: /continue learning/i })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("renders the resume card in the same reserved height once the read lands", async () => {
    const release = deferredFetch();
    render(<ContinueLearning />);

    release({ items: [ITEM] });

    const link = await screen.findByRole("link", { name: /resume lesson/i });
    expect(link).toHaveAttribute("href", "/atlas/series-1/series-1-2");

    const card = link.closest("[data-card]")!;
    expect(card.className).toContain(RESERVE);
    expect(card.className).toContain("rounded-[20px]");
    expect(card.className).toContain("mb-3");
    expect(card.className).toContain("last:mb-0");

    // Placeholder is gone — the card took its place, not its space plus more.
    expect(screen.queryByTestId("continue-learning-placeholder")).toBeNull();
    expect(
      screen.getByText(/3 of 12 lessons complete · next: Introduction to Salesforce Objects/),
    ).toBeTruthy();
    expect(screen.getByRole("region", { name: /continue learning/i })).not.toHaveAttribute(
      "aria-busy",
    );
  });

  it("renders nothing when there is no in-progress series", async () => {
    const release = deferredFetch();
    render(<ContinueLearning />);

    release({ items: [] });

    await waitFor(() =>
      expect(screen.queryByTestId("continue-learning-placeholder")).toBeNull(),
    );
    expect(screen.queryByRole("region", { name: /continue learning/i })).toBeNull();
  });

  it("renders nothing when the read fails (no placeholder left pulsing)", async () => {
    const release = deferredFetch();
    render(<ContinueLearning />);
    expect(screen.getByTestId("continue-learning-placeholder")).toBeTruthy();

    release({}, false);

    await waitFor(() =>
      expect(screen.queryByTestId("continue-learning-placeholder")).toBeNull(),
    );
    expect(screen.queryByRole("region", { name: /continue learning/i })).toBeNull();
  });

  it("renders nothing when the request rejects", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as never;
    render(<ContinueLearning />);

    await waitFor(() =>
      expect(screen.queryByTestId("continue-learning-placeholder")).toBeNull(),
    );
    expect(screen.queryByRole("region", { name: /continue learning/i })).toBeNull();
  });
});
