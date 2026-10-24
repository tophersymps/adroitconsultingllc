import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PathCard from "./PathCard";
import type { LearnCardSeries } from "@/data/types";

vi.mock("@/components/Progress/SeriesProgress", () => ({
  default: () => <div data-testid="series-progress" />,
}));
vi.mock("@/components/Progress/QuizStats", () => ({
  default: () => <div data-testid="quiz-stats" />,
}));

function card(overrides: Partial<LearnCardSeries>): LearnCardSeries {
  return {
    slug: "agentic-ai",
    name: "Agentic AI",
    description: "desc",
    gradient: "from-navy to-navy-light",
    lessonCount: 5,
    totalLessons: 5,
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

describe("PathCard preview link (ADR-221)", () => {
  it("renders 'Preview first lesson →' on a signed-in locked card", () => {
    const { container } = render(<PathCard series={card({ canAccess: false })} gate="signed-in" />);
    const preview = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "/atlas/agentic-ai/preview");
    expect(preview).toBeTruthy();
    expect(preview).toHaveTextContent("Preview first lesson");
    expect(container.querySelector("a a")).toBeNull();
  });

  it("does not render the preview link on a granted (canAccess) card", () => {
    render(<PathCard series={card({ canAccess: true })} gate="signed-in" />);
    expect(screen.queryByRole("link", { name: /preview first lesson/i })).toBeNull();
  });

  it("does not render the preview link on a guest-locked card (sign-in CTA instead)", () => {
    render(<PathCard series={card({ canAccess: false })} gate="guest-locked" />);
    expect(screen.queryByRole("link", { name: /preview first lesson/i })).toBeNull();
    expect(screen.getByRole("link", { name: /sign in to access courses/i })).toBeTruthy();
  });
});

/**
 * PERF-M2 (t_c54f6999): the post-hydration guest→signed-in swap must not change
 * the card's footer height. The guest footer is ~95px; the signed-in footer is
 * shorter, so each card shrank after hydration and reflowed every row below it
 * in the 2-column grid. Both footers now reserve a 96px floor, and the quiz row
 * (which QuizStats leaves empty until it has attempts) is reserved too.
 */
describe("PathCard footer height reservation (PERF-M2)", () => {
  function footers(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll("div.border-t")) as HTMLElement[];
  }

  it("reserves a 96px floor on the guest footer", () => {
    const { container } = render(
      <PathCard series={card({ canAccess: false })} gate="guest-locked" />,
    );
    const [footer] = footers(container);
    expect(footer.className).toContain("min-h-[96px]");
  });

  it("reserves the same 96px floor plus a quiz row on the signed-in footer", () => {
    const { container } = render(
      <PathCard series={card({ canAccess: true })} gate="signed-in" />,
    );
    const [footer] = footers(container);
    expect(footer.className).toContain("min-h-[96px]");

    const quizSlot = screen.getByTestId("quiz-stats").parentElement;
    expect(quizSlot?.className).toContain("min-h-[16px]");
  });

  /**
   * Zod review of PR #371 (F4): the two footers reserved the same floor but not
   * the same top margin (guest `mt-3`, signed-in `mt-4`), leaving ~4px of
   * residual growth on the guest→signed-in swap. Pin them to one value.
   */
  it("uses one top margin for both footers (F4 residual)", () => {
    const marginOf = (el: HTMLElement | undefined) =>
      el?.className.split(/\s+/).find((c) => /^mt-\d/.test(c));

    const guest = render(
      <PathCard series={card({ canAccess: false })} gate="guest-locked" />,
    );
    const guestMargin = marginOf(footers(guest.container)[0]);
    guest.unmount();

    const signed = render(
      <PathCard series={card({ canAccess: true })} gate="signed-in" />,
    );
    const signedMargin = marginOf(footers(signed.container)[0]);

    expect(guestMargin).toBe("mt-4");
    expect(signedMargin).toBe(guestMargin);
  });
});
