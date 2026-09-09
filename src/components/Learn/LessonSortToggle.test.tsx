/**
 * LessonSortToggle — accessible-name tests (a11y finding 7).
 *
 * The buttons show glyph text ("1 → 9" / "9 → 1") which is cryptic to
 * screen readers; each needs a descriptive aria-label naming the action.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LessonSortToggle from "./LessonSortToggle";

const paramsMock = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => paramsMock(),
  useRouter: () => ({ replace: vi.fn() }),
}));

describe("LessonSortToggle a11y (t_5664453e)", () => {
  beforeEach(() => {
    paramsMock.mockReturnValue(new URLSearchParams());
  });

  it("gives each sort button a descriptive accessible name", () => {
    render(<LessonSortToggle />);
    expect(
      screen.getByRole("button", { name: "Sort by lesson number ascending" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort by lesson number descending" }),
    ).toBeInTheDocument();
  });

  it("keeps aria-pressed reflecting the current sort", () => {
    paramsMock.mockReturnValue(new URLSearchParams("sort=desc"));
    render(<LessonSortToggle />);
    expect(
      screen.getByRole("button", { name: "Sort by lesson number descending" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Sort by lesson number ascending" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("gives every sort button a >=44px touch target (WCAG 2.5.8)", () => {
    render(<LessonSortToggle />);
    const asc = screen.getByRole("button", {
      name: "Sort by lesson number ascending",
    });
    const desc = screen.getByRole("button", {
      name: "Sort by lesson number descending",
    });
    for (const b of [asc, desc]) {
      expect(b.className).toContain("min-h-[44px]");
      expect(b.className).toContain("min-w-[44px]");
    }
  });
});
