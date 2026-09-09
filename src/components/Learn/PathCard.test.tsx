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
    render(<PathCard series={card({ canAccess: false })} gate="signed-in" />);
    const preview = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "/learn/agentic-ai/preview");
    expect(preview).toBeTruthy();
    expect(preview).toHaveTextContent("Preview first lesson");
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
